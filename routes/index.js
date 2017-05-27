var express = require('express');
var router = express.Router();
var request = require('request')
var path = require('path')
var fs = require('fs')
var xlsx = require('node-xlsx')
var async = require('async')

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

var mysql = require('mysql');
var connection = mysql.createPool({
  connectionLimit: 10,
  host: '101.199.126.121',
  user: 'root',
  password: 'wrk#%%^lsf',
  database: 'train',
  port: '3306',
  charset: 'utf8',
  multipleStatements: true
});
router.get('/getCity', function (req, res, next) {
  connection.query('select * from station', function (err, rows) {
    if (err) {
      console.log(err);
      return false
    } else {
      res.json(rows)
    }
  });

})

router.post('/setProvince', function (req, res, next) {
  var str = req.body.updateStr
  console.log('sql------' + str)
  connection.query({
    sql: str
  }, function (err, result) {
    console.log(result);
  });
  res.send('ok')
})

// multiparty三方包, 分片上传时，分片接收数据，生成分片数据文件，及自动合并分片文件
var multiparty = require('multiparty');
router.post('/multipartyFileUpload', function (req, res, next) {
  // console.log(req.body , req.query,req.files)
  // console.log(req.body, req.files);
  var form = new multiparty.Form({
    uploadDir: 'data/files/'
  })

  form.parse(req)

  form.on('part', function (part) {
    res.send('ok')
    var dd = [], ll = 0;
    part.on('data', function (data) {
      if (!data.length) { return;}
      dd.push(data);
      ll += data.length;
    });

    part.on('end', function () {

      fs.open('data/files/' + part.name, 'a+', function (err, fd) {
        if (err) { throw err;}
        try {
          console.log('fd:' + fd)
          fs.write(fd, Buffer.concat(dd, ll), 0, ll, 0, function (err) {
            if (err) { console.log('err:' + err)}
            fs.close(fd, function () {
              res.end()
              console.log('file closed')
            })
          });
        } catch (e) {
          console.log(e.stack)
        }
      });

    })
  })

})

// formidable三方包, 分片上传时，分片接收数据，生成分片数据文件
var formidable = require('formidable')
router.post('/formidableUpload', function (req, res, next) {

  console.log(req.body, req.query, req.files)
  var form = new formidable.IncomingForm({
    uploadDir: 'data/files/'
  })

  form.parse(req, function (err, fields, files) {
    /* console.log('fields1:'+JSON.stringify(fields))
     console.log('files1:'+JSON.stringify(files))*/
    var dataInfo = files.dataInfo;
    var uploadedPath = dataInfo.path;
    var dstPath = 'data/files/' + fields[ 'index' ];

    fs.rename(uploadedPath, dstPath, function (err) {
      if (err) { throw err}
      console.log('file is created')
      res.send('ok')
    })
  })

})

var pathObj = {
  uploadPath: '',
  uploadPathNew: ''
}

// 配合formidable三方包 , 自己手动合并分片文件
router.post('/mergeFiles', function (req, res, next) {

  if (req.body.total) {
    var total = req.body.total - 0,
      basePath = 'data/files/';
    var uploadPath = basePath + req.body.name
    console.log('uploadPath', uploadPath)
    pathObj.uploadPath = uploadPath
    var mergeFilesInfo = function (n) {
      var path = basePath + n;
      console.log('read file -----' + path)
      fs.readFile(path, function (err, data) {
        if (err) { throw err}
        fs.open(uploadPath, 'a+', function (err, fd) {
          if (err) { throw err;}
          fs.write(fd, data, 0, data.length, 0, function (err) {
            if (err) { throw err}
            fs.close(fd, function () {
              console.log('file closed')
              fs.unlinkSync(path)
              if (n + 1 <= total) {
                console.log('n:' + (n + 1));
                mergeFilesInfo(n + 1)
              }
            })
          });
        });
      })
    };
    mergeFilesInfo(1)
    res.send('ok')
  }
})

router.get('/download', function (req, res, next) {
  res.download(pathObj.uploadPathNew)
})

var citySearch, currentCount = 800;
router.post('/searchCity', function (req, res, next) {
  var list = xlsx.parse(pathObj.uploadPath),
    data = list[ 0 ].data, dLen = data.length;
  citySearch = req.body.city || ''

  console.log('查询城市：' + citySearch)
  console.log('数据Total：-----' + dLen + '条')

  // 并发处理
  async.mapLimit(data, currentCount, function (city, callback) {
    searchCityCurrent(city, callback)
  }, function (err, result) {
    writeExcelFle(res, result)
  })

})

// 高德API  POI查询
function searchCityCurrent (city, cb) {
  request.post('http://restapi.amap.com/v3/geocode/geo', {
    'form': {
      'address': city[ 0 ],
      'key': 'ad81930d052fa7b2b45c780ec71326de',
      'city': citySearch
    }
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var dt = JSON.parse(body);
      if (dt.geocodes && dt.geocodes.length) {
        var data = city.concat([ dt.geocodes[ 0 ].location ])
        cb(null, data)
      } else {
        cb(null, city)
      }
    } else {
      cb(null, city)
    }
  })
}

// excel 读写
function writeExcelFle (res, dt) {
  var buffer = xlsx.build([ {
    name: 'Sheet1',
    data: dt
  } ])
  var pathName = pathObj.uploadPath.split('.')
  pathObj.uploadPathNew = pathName[ 0 ] + '_new.' + pathName[ 1 ]
  fs.writeFileSync(pathObj.uploadPathNew, buffer, { 'flag': 'w' });
  res.send('search over !!!')
  res.end()
}

module.exports = router;
