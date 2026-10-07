# إعداد Railway - دليل شامل ✅

## المتطلبات الأساسية

### 1. متغيرات البيئة المطلوبة في Railway Dashboard

انتقل إلى **Variables** في لوحة تحكم Railway وأضف:

```
PORT=5000
NODE_ENV=production
CORS_ORIGIN=*
TRUST_PROXY=true

JWT_SECRET=your_very_secure_secret_key_here_change_this
DATABASE_URL=postgresql://user:password@host:5432/database_name

# Optional - Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
```

### 2. اختبار الـ Backend بعد الرفع

بعد ما ترفع على Railway، افتح هذه الروابط في المتصفح:

#### ✅ اختبر الـ endpoints دي:

```
# الـ Root
https://now-api-production.up.railway.app/

# الـ API Info
https://now-api-production.up.railway.app/api

# Health Check
https://now-api-production.up.railway.app/api/health

# الـ Stores (بدون authentication)
https://now-api-production.up.railway.app/api/stores
```

---

## الأخطاء الشائعة والحلول

### ❌ خطأ: `{"success":false,"message":"المسار غير موجود"}`

**السبب:** الـ endpoint لا يوجد أو معطوب

**الحل:**
1. تأكد من اسم الـ endpoint (مثل `/api/stores` ليس `/stores`)
2. تأكد من أن الـ request method صحيح (GET، POST، وغيره)
3. جرب الـ health endpoint: `/api/health`

---

### ❌ خطأ: `{"success":false,"message":"يجب تسجيل الدخول أولاً"}`

**السبب:** الـ endpoint يحتاج authentication token

**الحل:** أضف **Authorization Header** لـ request:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

احصل على token من `/api/auth/login`

---

### ❌ خطأ CORS من المتصفح

**السبب:** `CORS_ORIGIN` غير مضبوطة صحيح

**الحل:** تأكد من `CORS_ORIGIN=*` في Railway variables

---

## كيفية الحصول على API Token

### من التطبيق (Expo/React Native):

```javascript
const response = await axios.post(
  'https://now-api-production.up.railway.app/api/auth/login',
  {
    phone: '+966500000000',  // رقم صحيح
    password: 'password123',  // كلمة المرور
    role: 'customer'  // أو vendor, delivery, admin
  }
);

const token = response.data.data.token;
console.log('Token:', token);
```

### من Postman أو curl:

```bash
curl -X POST \
  https://now-api-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+966500000000",
    "password": "password123",
    "role": "customer"
  }'
```

---

## مثال كامل - طلب البيانات من الـ Browser

```javascript
// 1. سجل الدخول واحصل على token
fetch('https://now-api-production.up.railway.app/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: '+966500000000',
    password: 'password123',
    role: 'customer'
  })
})
.then(r => r.json())
.then(data => {
  const token = data.data.token;
  
  // 2. استخدم الـ token للوصول للـ endpoints المحمية
  return fetch('https://now-api-production.up.railway.app/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
})
.then(r => r.json())
.then(data => console.log('User:', data));
```

---

## ملاحظات مهمة للتطبيق (Expo)

### تحديث ملف البيئة:

في `mobile/.env`:
```
EXPO_PUBLIC_API_URL=https://now-api-production.up.railway.app/api
```

### التحقق من الـ API URL في الكود:

```javascript
// services/api.js
const getApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  // Fallback للتطوير
  return 'https://now-api-production.up.railway.app/api';
};
```

---

## Database

تأكد من أن قاعدة البيانات:
- مرتبطة صح مع Railway
- مخزنة في `DATABASE_URL`
- جميع الـ migrations مطبقة

```bash
# إذا كنت في التطوير المحلي:
npm run prisma:migrate
npm run prisma:seed
```

---

## Troubleshooting

### 1. التحقق من الـ Logs

```bash
# في Railway Dashboard
Deployments → Logs
```

### 2. تشغيل الـ Server محلياً أولاً

```bash
npm install
npm run dev
```

ثم اختبر الـ endpoints من `http://localhost:5000`

### 3. إعادة Deploy

```bash
git add .
git commit -m "Fix: Update CORS and error handling"
git push  # سيؤدي لـ redeploy تلقائي
```

---

## التحقق النهائي ✅

- [ ] البيانات ترجع من `/api` و `/api/health`
- [ ] `/api/stores` يرجع قائمة المتاجر
- [ ] `/api/auth/login` يرجع token
- [ ] Authentication يعمل صح مع الـ protected endpoints
- [ ] CORS يسمح بالـ requests من المتصفح والتطبيق
