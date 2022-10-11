require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var Queue = require('bull');
var RedisServer = require('redis-server');
var redis = require('redis');
var cors = require('cors');
var helmet = require('helmet');
var compression = require('compression');

if (process.env.NODE_ENV !== 'production') {
	// Simply pass the port that you want a Redis server to listen on.
	const redisServer = new RedisServer(6379);

	redisServer.open((err: any) => {
		if (err === null) {
			// You may now connect a client to the Redis server bound to port 6379.
		}
	});
	const client = redis.createClient();
	client.connect();
}

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

// Connect to a local redis intance locally, and the Heroku-provided URL in production
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const app = express();
// Create / Connect to a named work queue
const workQueue = new Queue('worker', REDIS_URL);

const originList = ['*', 'http://localhost:3000'];
const corsOptions = { origin: originList, credentials: true };

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());

app.use('/', indexRouter);
app.use('/api', apiRouter);

// catch 404 and forward to error handler
app.use(function (req: any, res: any, next: any) {
	next(createError(404));
});

// error handler
app.use(function (err: any, req: any, res: any, next: any) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

// You can listen to global events to get notified when jobs are processed
workQueue.on('global:completed', (jobId: any, result: any) => {
	console.log(`Job ${jobId} completed with result ${result}`);
});

module.exports = app;
