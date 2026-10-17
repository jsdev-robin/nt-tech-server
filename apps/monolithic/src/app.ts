import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import { globalErrorHandler, notFoundHandler } from 'express-global-guard';
import * as useragent from 'express-useragent';
import helmet from 'helmet';
import ipinfo, { defaultIPSelector } from 'ipinfo-express';
import morgan from 'morgan';
import { config } from './configs/configs';
import { limiter } from './middlewares/limiter';
import authRouter from './routes/auth/authRoutes';

const app: Application = express();

// Development logging
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Express 5 defaults to 'simple' — switch back to nested parsing:
app.set('query parser', 'extended');

// Proxy middleware
app.set('trust proxy', 1);

// Parse request bodies
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Parse cookies
app.use(cookieParser(config.COOKIE_SECRET));

app.use(
  ipinfo({
    token: config.IPINFO_KEY,
    cache: null,
    timeout: 5000,
    ipSelector: defaultIPSelector,
  }),
);

// Configure Cross-Origin Resource Sharing (CORS)
app.use(
  cors({
    origin: [
      config.WEB_CLIENT_URL,
      config.AGENT_CLIENT_URL,
      config.ADMIN_CLIENT_URL,
    ],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-timezone'],
    credentials: true,
  }),
);

// Rate limit
app.use(limiter(15 * 60 * 1000, 10000));

// Get user device info
app.use(useragent.express());

app.use(helmet());

app.get('/', (_, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

app.use('/api/v1/auth', authRouter);

// Handle 404 errors
app.all(/(.*)/, notFoundHandler);
app.use(globalErrorHandler);

export default app;
