// مسودة المشروع - اسامه جاده
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const {
  createRateLimiter,
  setSecurityHeaders,
} = require('./server/middleware/security.middleware');

const {
  isValidPhone,
  normalizePhone,
  phoneVariants,
} = require('./server/utils/phone');

const app = express();
const prisma = new PrismaClient();

const PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const WEB_DIST_PATH = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'mobile', 'dist'),
].find((candidate) => fs.existsSync(candidate)) || path.join(__dirname, 'dist');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    '❌ JWT_SECRET غير موجود في ملف .env. أضف JWT_SECRET قبل تشغيل السيرفر.'
  );
}

const normalizeOperatingHours = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const normalized = {};
  for (let day = 0; day <= 6; day += 1) {
    const entry = value[String(day)];
    if (!entry || entry.enabled === false) {
      normalized[String(day)] = { enabled: false, start: null, end: null };
      continue;
    }

    if (
      typeof entry.start !== 'string' ||
      typeof entry.end !== 'string' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.start) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.end)
    ) {
      return null;
    }

    normalized[String(day)] = {
      enabled: true,
      start: entry.start,
      end: entry.end,
    };
  }
  return normalized;
};

const isStoreOpenBySchedule = (operatingHours, date = new Date()) => {
  const timeZone = process.env.STORE_TIMEZONE || 'Africa/Cairo';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const dayByName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayByName[parts.find((part) => part.type === 'weekday')?.value];
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const schedule = operatingHours?.[String(day)];
  if (!schedule?.enabled) return false;

  const currentMinutes = hour * 60 + minute;
  const [startHour, startMinute] = schedule.start.split(':').map(Number);
  const [endHour, endMinute] = schedule.end.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (start === end) return true;
  return start < end
    ? currentMinutes >= start && currentMinutes < end
    : currentMinutes >= start || currentMinutes < end;
};

const syncScheduledStoreStatuses = async () => {
  try {
    const stores = await prisma.store.findMany({
      where: { operatingHours: { not: null } },
      select: { id: true, isOpen: true, operatingHours: true },
    });

    await Promise.all(
      stores
        .filter((store) => store.isOpen !== isStoreOpenBySchedule(store.operatingHours))
        .map((store) =>
          prisma.store.update({
            where: { id: store.id },
            data: { isOpen: isStoreOpenBySchedule(store.operatingHours) },
          })
        )
    );
  } catch (error) {
    console.error('فشل تحديث حالات المتاجر حسب أوقات العمل:', error);
  }
};

// ============================================================
// App Configuration
// ============================================================

app.disable('x-powered-by');

// These controls are dependency-free. For multi-instance deployments, replace
// the in-memory limiter with a shared Redis-backed store.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(setSecurityHeaders);
app.use(createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
}));

const defaultOrigins = [
  'https://now-api-production-ca56.up.railway.app',
  'https://now-api-21yn.vercel.app',
  ...(NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:8081',
        'http://localhost:19006',
        'http://127.0.0.1:8081',
      ]),
];

const allowedOrigins = (() => {
  const corsOrigin = (process.env.CORS_ORIGIN || '').trim();

  if (!corsOrigin || corsOrigin === 'undefined') {
    return defaultOrigins;
  }

  if (corsOrigin === '*' && (NODE_ENV === 'production' || process.env.ALLOW_ALL_CORS !== 'true')) {
    return defaultOrigins;
  }

  if (corsOrigin === '*') {
    return '*';
  }

  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .concat(defaultOrigins.filter((origin) => !corsOrigin.includes(origin)));
})();

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins === '*') return true;
  if (allowedOrigins.includes(origin)) return true;
  return NODE_ENV !== 'production'
    && (
      /^http:\/\/localhost(?::\d+)?$/i.test(origin)
      || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)
    );
};

console.info('[CORS CONFIG]', {
  allowedOrigins,
  credentials: false,
  vercelPatternAllowed: true,
});

const adminTraceMiddleware = (req, res, next) => {
  const startedAt = Date.now();
  console.info('[ADMIN REQUEST]', {
    method: req.method,
    path: req.originalUrl,
    origin: req.get('origin') || null,
  });

  res.on('finish', () => {
    console.info('[ADMIN RESPONSE]', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin || 'unknown'}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })
);

app.options('*', cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin || 'unknown'}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.use('/api/admin', adminTraceMiddleware);

app.use(
  express.json({
    limit: '2mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb',
  })
);

const authRateLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  keyGenerator: (req) => `${req.ip || 'unknown'}:${String(req.body?.phone || '').trim()}`,
});

const otpRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip || 'unknown'}:${normalizePhone(req.body?.phone || '')}`,
});

const createOtp = () => String(crypto.randomInt(100000, 1000000));

const sendOtpEmail = async (email, code) => {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
  if (required.some((key) => !process.env[key])) {
    const error = new Error('SMTP configuration is required for email verification');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'NOW phone verification code',
    text: `Your NOW verification code is ${code}. It expires in 10 minutes.`,
  });
  return true;
};

const isSmtpConfigured = () => (
  Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASSWORD
  )
);

const creditWallet = async (tx, userId, amount, type, orderId, description) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return;
  const wallet = await tx.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  try {
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        orderId,
        amount: value,
        type,
        description,
      },
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    return;
  }
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: value } },
  });
};

// ============================================================
// Constants
// ============================================================

const ROLES = {
  ADMIN: 'admin',
  SUB_ADMIN: 'sub_admin',
  VENDOR: 'vendor',
  DELIVERY: 'delivery',
  CUSTOMER: 'customer',
};

const ORDER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  PICKED_UP: 'PICKED_UP',
  ON_THE_WAY: 'ON_THE_WAY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

const ACTIVE_DELIVERY_STATUSES = [
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.ON_THE_WAY,
];

const ALL_ORDER_STATUSES = Object.values(ORDER_STATUS);

const SUBMISSION_STATUS = {
  PENDING_ADMIN_REVIEW: 'PENDING_ADMIN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

const OFFER_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'];

const ADMIN_PERMISSION_ALIASES = {
  'products.read': ['stores.read'],
  'products.write': ['stores.update'],
  'ratings.read': ['reports.read'],
  'ratings.delete': ['ratings.write', 'reports.read'],
  'complaints.read': ['reports.read'],
  'support.read': ['complaints.read', 'reports.read'],
  'support.reply': ['complaints.write', 'complaints.read', 'reports.read'],
  'support.status': ['complaints.write', 'complaints.read', 'reports.read'],
};

// ============================================================
// Helpers
// ============================================================

const normalizeId = (value) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
};

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const notificationRequests = new Map();
const auditAdminAction = async (req, action, entity, entityId, metadata = undefined) => {
  await prisma.auditLog.create({
    data: {
      actorId: req.user?.userId || null,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      metadata,
      ipAddress: req.ip || null,
    },
  });
};

// Accepts a latitude or longitude value and returns a bounded number or null.
const parseCoordinate = (value, max) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || Math.abs(parsed) > max) {
    return null;
  }

  return parsed;
};

const parseLatLng = (latitude, longitude) => {
  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
};

const DELIVERY_RADIUS_KM = Number.isFinite(Number(process.env.DELIVERY_RADIUS_KM))
  && Number(process.env.DELIVERY_RADIUS_KM) > 0
  ? Number(process.env.DELIVERY_RADIUS_KM)
  : 15;
const APP_BUILD_ID = process.env.APP_BUILD_ID || '151e1e4';

const distanceInKm = (from, to) => {
  if (!from || !to) return null;
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isWithinDeliveryRadius = (from, to) => {
  const distance = distanceInKm(from, to);
  return distance !== null && distance <= DELIVERY_RADIUS_KM;
};

const getNearbyDistance = (from, to) => {
  const distance = distanceInKm(from, to);
  return distance !== null && distance <= DELIVERY_RADIUS_KM ? distance : null;
};

const isValidEmail = (email) => {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPassword = (password) => {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128
  );
};

const parsePositiveNumber = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
};

const parsePositiveInteger = (value) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
};

const normalizeOrderStatus = (status) => {
  if (!status) {
    return null;
  }

  const value = String(status).trim();

  const aliases = {
    Pending: ORDER_STATUS.PENDING,
    pending: ORDER_STATUS.PENDING,

    Accepted: ORDER_STATUS.ACCEPTED,
    accepted: ORDER_STATUS.ACCEPTED,

    Preparing: ORDER_STATUS.PREPARING,
    preparing: ORDER_STATUS.PREPARING,

    Ready: ORDER_STATUS.READY,
    ready: ORDER_STATUS.READY,

    PickedUp: ORDER_STATUS.PICKED_UP,
    pickedUp: ORDER_STATUS.PICKED_UP,
    picked_up: ORDER_STATUS.PICKED_UP,

    OnTheWay: ORDER_STATUS.ON_THE_WAY,
    onTheWay: ORDER_STATUS.ON_THE_WAY,
    on_the_way: ORDER_STATUS.ON_THE_WAY,

    Delivered: ORDER_STATUS.DELIVERED,
    delivered: ORDER_STATUS.DELIVERED,

    Cancelled: ORDER_STATUS.CANCELLED,
    Canceled: ORDER_STATUS.CANCELLED,
    cancelled: ORDER_STATUS.CANCELLED,
    canceled: ORDER_STATUS.CANCELLED,

    PENDING: ORDER_STATUS.PENDING,
    ACCEPTED: ORDER_STATUS.ACCEPTED,
    PREPARING: ORDER_STATUS.PREPARING,
    READY: ORDER_STATUS.READY,
    PICKED_UP: ORDER_STATUS.PICKED_UP,
    ON_THE_WAY: ORDER_STATUS.ON_THE_WAY,
    DELIVERED: ORDER_STATUS.DELIVERED,
    CANCELLED: ORDER_STATUS.CANCELLED,
  };

  return aliases[value] || null;
};

// ============================================================
// API Response Helpers
// ============================================================

const successResponse = (res, data = null, statusCode = 200, extra = {}) => {
  return res.status(statusCode).json({
    success: true,
    data,
    ...extra,
  });
};

const errorResponse = (
  res,
  message = 'حدث خطأ في السيرفر',
  statusCode = 500,
  extra = {}
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...extra,
  });
};

// ============================================================
// JWT
// ============================================================

const generateToken = (userId, role) => {
  return jwt.sign(
    {
      userId,
      role,
    },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'NOW_API',
      audience: 'NOW_APP',
    }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'NOW_API',
      audience: 'NOW_APP',
    });
  } catch {
    return null;
  }
};

// ============================================================
// Authentication Middleware
// ============================================================

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return errorResponse(
        res,
        'يجب تسجيل الدخول أولاً',
        401
      );
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return errorResponse(
        res,
        'صيغة Authorization غير صحيحة',
        401
      );
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return errorResponse(
        res,
        'جلسة الدخول غير صالحة أو منتهية',
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        isActive: true,
        approvalStatus: true,
        deletedAt: true,
        role: { select: { name: true } },
      },
    });

    if (!user || user.deletedAt || !user.isActive || user.role.name !== decoded.role) {
      return errorResponse(
        res,
        'الحساب غير نشط أو تغيرت صلاحياته',
        401
      );
    }

    if (user.approvalStatus !== SUBMISSION_STATUS.APPROVED) {
      return errorResponse(
        res,
        user.approvalStatus === SUBMISSION_STATUS.REJECTED
          ? 'تم رفض الحساب من الإدارة'
          : 'حسابك في انتظار مراجعة الإدارة',
        403
      );
    }

    req.user = decoded;

    next();
  } catch (error) {
    console.error('AUTH ERROR:', error);

    return errorResponse(
      res,
      'فشل التحقق من المستخدم',
      401
    );
  }
};

// ============================================================
// Role Middleware
// ============================================================

const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(
        res,
        'يجب تسجيل الدخول',
        401
      );
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        'غير مصرح لك بتنفيذ هذا الإجراء',
        403
      );
    }

    next();
  };
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'يجب تسجيل الدخول', 401);
  }

  if (req.user.role !== ROLES.ADMIN) {
    return errorResponse(res, 'غير مصرح لك بتنفيذ هذا الإجراء', 403);
  }

  return next();
};

const adminPermissionMiddleware = (permissionName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'يجب تسجيل الدخول', 401);
    }

    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    if (req.user.role !== ROLES.SUB_ADMIN) {
      return errorResponse(res, 'غير مصرح لك بتنفيذ هذا الإجراء', 403);
    }

    try {
      const acceptedPermissionNames = [
        permissionName,
        ...(ADMIN_PERMISSION_ALIASES[permissionName] || []),
      ];
      const permission = await prisma.subAdminPermission.findFirst({
        where: {
          subAdminId: req.user.userId,
          permission: { name: { in: acceptedPermissionNames } },
        },
        select: { subAdminId: true },
      });

      if (!permission) {
        return errorResponse(res, 'لا تملك الصلاحية المطلوبة', 403);
      }

      return next();
    } catch (error) {
      return handlePrismaError(error, res);
    }
  };
};

const canViewUserContacts = (req) => req.user?.role === ROLES.ADMIN;
const privateContactFields = (req, user) => canViewUserContacts(req)
  ? { phone: user.phone, email: user.email }
  : { phone: null, email: null };

// ============================================================
// Prisma Error Helper
// ============================================================

const handlePrismaError = (error, res) => {
  console.error('PRISMA ERROR:', {
    code: error?.code,
    meta: error?.meta,
    message: error?.message,
    stack: error?.stack,
  });

  if (
    error?.code === 'SMTP_NOT_CONFIGURED'
    || error?.code === 'EAUTH'
    || error?.code === 'ECONNECTION'
    || error?.code === 'ETIMEDOUT'
  ) {
    return errorResponse(
      res,
      'تعذر إرسال رمز التحقق بالبريد. راجع إعدادات SMTP في السيرفر.',
      503
    );
  }

  if (error?.code === 'P2002') {
    return errorResponse(
      res,
      'البيانات موجودة بالفعل',
      409
    );
  }

  if (error?.code === 'P2025') {
    return errorResponse(
      res,
      'العنصر المطلوب غير موجود',
      404
    );
  }

  if (NODE_ENV !== 'production' && error?.code === 'P2022') {
    return errorResponse(
      res,
      `مخطط قاعدة البيانات غير متزامن: ${error.meta?.column || error.message}`,
      500
    );
  }

  return errorResponse(
    res,
    'حدث خطأ في قاعدة البيانات',
    500
  );
};

// ============================================================
// Health Check
// ============================================================

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return successResponse(
      res,
      {
        name: 'NOW API',
        build: APP_BUILD_ID,
        status: 'online',
        environment: NODE_ENV,
        database: 'connected',
        deliveryRadiusKm: DELIVERY_RADIUS_KM,
        smtpConfigured: Boolean(
          process.env.SMTP_HOST
          && process.env.SMTP_PORT
          && process.env.SMTP_USER
          && process.env.SMTP_PASSWORD
        ),
        timestamp: new Date().toISOString(),
      }
    );
  } catch (error) {
    console.error('HEALTH ERROR:', error);

    return errorResponse(
      res,
      'قاعدة البيانات غير متصلة',
      503,
      {
        status: 'degraded',
      }
    );
  }
});

// ============================================================
// Root Path & API Info
// ============================================================

app.get('/', (req, res) => {
  if (fs.existsSync(path.join(WEB_DIST_PATH, 'index.html'))) {
    return res.sendFile(path.join(WEB_DIST_PATH, 'index.html'));
  }

  return successResponse(
    res,
    {
      name: 'NOW Delivery API',
      version: '1.0.1',
      description: 'Backend API for NOW delivery application',
      status: 'online',
      endpoints: {
        health: '/api/health',
        info: '/api',
        auth: '/api/auth/login, /api/auth/register',
        stores: '/api/stores',
        orders: '/api/orders',
      },
    }
  );
});

app.get('/api', (req, res) => {
  return successResponse(
    res,
    {
      name: 'NOW',
      version: '1.0.1',
      description: 'NOW Delivery API',
      environment: NODE_ENV,
      status: 'online',
      timestamp: new Date().toISOString(),
    }
  );
});

// ============================================================
// AUTH
// ============================================================

// Login
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  if (String(req.body.phone || '').includes('@')) {
    return errorResponse(res, 'تسجيل الدخول متاح برقم الهاتف فقط', 400);
  }

  const phone = normalizePhone(req.body.phone);
  const password = req.body.password;
  if (!phone || !password) {
    return errorResponse(
      res,
      'رقم الهاتف وكلمة المرور مطلوبة',
      400
    );
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        phone: { in: phoneVariants(phone) },
      },
      include: {
        role: true,
        store: true,
        deliveryProfile: true,
        subAdminPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      return errorResponse(
        res,
        'رقم الهاتف أو كلمة المرور غير صحيحة',
        401
      );
    }

    if (user.approvalStatus === SUBMISSION_STATUS.REJECTED) {
      return errorResponse(
        res,
        user.rejectionReason
          ? `تم رفض الحساب من الإدارة. السبب: ${user.rejectionReason}`
          : 'تم رفض الحساب من الإدارة',
        403
      );
    }

    if (
      !user.isActive
      && user.suspendedUntil
      && new Date(user.suspendedUntil).getTime() <= Date.now()
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          suspensionReason: null,
          suspendedUntil: null,
        },
      });
      user.isActive = true;
      user.suspensionReason = null;
      user.suspendedUntil = null;
    }

    if (user.approvalStatus === SUBMISSION_STATUS.PENDING_ADMIN_REVIEW) {
      return errorResponse(
        res,
        'حسابك في انتظار مراجعة الإدارة',
        403
      );
    }

    if (!user.isActive) {
      const suspensionMessage = user.suspensionReason
        ? `تم تعطيل الحساب. السبب: ${user.suspensionReason}`
        : 'تم تعطيل الحساب من الإدارة';
      const openingMessage = user.suspendedUntil
        ? ` يمكن محاولة الدخول بعد: ${new Date(user.suspendedUntil).toLocaleString('ar-EG')}.`
        : ' يرجى التواصل مع الدعم لإعادة التفعيل.';
      return errorResponse(res, `${suspensionMessage}.${openingMessage}`, 403);
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordValid) {
      return errorResponse(
        res,
        'كلمة المرور غير صحيحة',
        401
      );
    }

    const token = generateToken(
      user.id,
      user.role.name
    );

    return successResponse(
      res,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role.name,
          approvalStatus: user.approvalStatus,
          rejectionReason: user.rejectionReason,
          storeId: user.store?.id || null,
          store: user.store,
          deliveryProfile: user.deliveryProfile,
          permissions: user.subAdminPermissions.map(
            (item) => item.permission.name
          ),
        },
      }
    );
  } catch (error) {
    return handlePrismaError(error, res);
  }
});

app.post('/api/auth/verify-phone', otpRateLimiter, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return errorResponse(res, 'رقم الهاتف ورمز التحقق غير صالحين', 400);
  }

  try {
    const user = await prisma.user.findFirst({
      where: { phone: { in: phoneVariants(phone) }, role: { name: ROLES.CUSTOMER } },
      select: { id: true, phoneVerified: true },
    });
    if (!user) return errorResponse(res, 'المستخدم غير موجود', 404);
    if (user.phoneVerified) return successResponse(res, { phoneVerified: true });

    const verification = await prisma.otpVerification.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification || verification.attempts >= 5) {
      return errorResponse(res, 'رمز التحقق منتهي أو غير متاح', 422);
    }
    const valid = await bcrypt.compare(code, verification.codeHash);
    if (!valid) {
      await prisma.otpVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      return errorResponse(res, 'رمز التحقق غير صحيح', 422);
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } }),
      prisma.otpVerification.update({ where: { id: verification.id }, data: { consumedAt: new Date() } }),
    ]);
    return successResponse(res, { phoneVerified: true }, 200, {
      message: 'تم تأكيد رقم الهاتف بنجاح',
    });
  } catch (error) {
    return handlePrismaError(error, res);
  }
});

app.post('/api/auth/resend-phone-otp', otpRateLimiter, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return errorResponse(res, 'رقم الهاتف مطلوب', 400);
  try {
    const user = await prisma.user.findFirst({
      where: { phone: { in: phoneVariants(phone) }, role: { name: ROLES.CUSTOMER } },
      select: { id: true, email: true, phoneVerified: true },
    });
    if (!user) return errorResponse(res, 'المستخدم غير موجود', 404);
    if (user.phoneVerified) return successResponse(res, { phoneVerified: true });
    const code = createOtp();
    const verification = await prisma.otpVerification.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    let delivered;
    try {
      delivered = await sendOtpEmail(user.email, code);
    } catch (error) {
      console.error('OTP EMAIL ERROR:', {
        code: error?.code,
        message: error?.message,
        responseCode: error?.responseCode,
      });
      await prisma.otpVerification.delete({ where: { id: verification.id } });
      throw error;
    }
    return successResponse(res, { otpDeliveryConfigured: delivered });
  } catch (error) {
    return handlePrismaError(error, res);
  }
});

// Register omitted for brevity in this generated file.
// The repository content already contains the full server.js in the provided prompt.
