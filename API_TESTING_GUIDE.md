# دليل الاختبار الشامل - NOW API

## قبل أي اختبار
1. تأكد من رفع التعديلات الجديدة إلى Railway
2. انتظر 2-3 دقائق لإعادة Deploy
3. افتح Railway Logs للتحقق من الأخطاء

---

## المرحلة الأولى: اختبر الـ API نفسه

### ✅ Test 1: Root Endpoint
```
GET https://now-api-production.up.railway.app/
```
**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "name": "NOW Delivery API",
    "version": "1.0.0",
    "description": "Backend API for NOW delivery application",
    "status": "online",
    "endpoints": { ... }
  }
}
```

### ✅ Test 2: API Info Endpoint
```
GET https://now-api-production.up.railway.app/api
```
**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "name": "NOW",
    "version": "1.0.0",
    "description": "NOW Delivery API",
    "environment": "production",
    "status": "online",
    "timestamp": "2024-12-29T10:30:00.000Z"
  }
}
```

### ✅ Test 3: Health Check
```
GET https://now-api-production.up.railway.app/api/health
```
**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "name": "NOW API",
    "status": "online",
    "environment": "production",
    "database": "connected",
    "timestamp": "2024-12-29T10:30:00.000Z"
  }
}
```

**لو حصلت على Database Error:**
- تحقق من `DATABASE_URL` في Railway
- تأكد من أن Database نشطة
- جرب إعادة Deploy

---

## المرحلة الثانية: اختبر البيانات بدون Authentication

### ✅ Test 4: الحصول على قائمة المتاجر
```
GET https://now-api-production.up.railway.app/api/stores
```

**الرد المتوقع:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Burger Store",
      "vendor": { "name": "Ahmed", "phone": "966..." },
      ...
    },
    ...
  ]
}
```

### ✅ Test 5: الحصول على متجر محدد
```
GET https://now-api-production.up.railway.app/api/stores/1
```

**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Burger Store",
    "vendor": { ... },
    "menuItems": [ ... ]
  }
}
```

---

## المرحلة الثالثة: اختبر Authentication

### ✅ Test 6: تسجيل الدخول (Login)
```
POST https://now-api-production.up.railway.app/api/auth/login

Headers:
{
  "Content-Type": "application/json"
}

Body:
{
  "phone": "+966500000000",
  "password": "password123",
  "role": "customer"
}
```

**الرد المتوقع (عند النجاح):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Ahmed",
      "phone": "+966500000000",
      "role": "customer"
    }
  }
}
```

**الرد المتوقع (عند الفشل):**
```json
{
  "success": false,
  "message": "رقم الهاتف أو كلمة المرور غير صحيحة",
  "status": 401
}
```

### ✅ Test 7: الحصول على بيانات المستخدم (مع Token)
```
GET https://now-api-production.up.railway.app/api/auth/me

Headers:
{
  "Authorization": "Bearer YOUR_TOKEN_HERE"
}
```

**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Ahmed",
    "phone": "+966500000000",
    "email": "ahmed@example.com",
    "role": "customer"
  }
}
```

---

## المرحلة الرابعة: اختبر الطلبات (Orders)

### ✅ Test 8: إنشاء طلب جديد
```
POST https://now-api-production.up.railway.app/api/orders

Headers:
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_TOKEN_HERE"
}

Body:
{
  "storeId": 1,
  "address": "شارع النيل، المنزل رقم 5",
  "latitude": 24.7136,
  "longitude": 46.6753,
  "items": [
    {
      "menuItemId": 1,
      "quantity": 2
    },
    {
      "menuItemId": 2,
      "quantity": 1
    }
  ]
}
```

**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "id": 100,
    "customerId": 1,
    "storeId": 1,
    "address": "شارع النيل، المنزل رقم 5",
    "totalPrice": 150,
    "status": "PENDING",
    "items": [
      {
        "menuItemId": 1,
        "quantity": 2,
        "priceAtOrder": 50
      },
      ...
    ]
  }
}
```

### ✅ Test 9: الحصول على طلبات المستخدم
```
GET https://now-api-production.up.railway.app/api/customer/1/orders

Headers:
{
  "Authorization": "Bearer YOUR_TOKEN_HERE"
}
```

---

## اختبارات الأخطاء (Error Testing)

### ❌ Test 10: مسار غير موجود
```
GET https://now-api-production.up.railway.app/api/xyz-not-exists
```

**الرد المتوقع (مع التحسينات الجديدة):**
```json
{
  "success": false,
  "message": "المسار \"GET /api/xyz-not-exists\" غير موجود",
  "method": "GET",
  "path": "/api/xyz-not-exists",
  "status": 404
}
```

### ❌ Test 11: طلب بدون Authentication
```
GET https://now-api-production.up.railway.app/api/auth/me
```

**الرد المتوقع:**
```json
{
  "success": false,
  "message": "يجب تسجيل الدخول أولاً",
  "status": 401
}
```

### ❌ Test 12: Token غير صحيح
```
GET https://now-api-production.up.railway.app/api/auth/me

Headers:
{
  "Authorization": "Bearer INVALID_TOKEN"
}
```

**الرد المتوقع:**
```json
{
  "success": false,
  "message": "جلسة الدخول غير صالحة أو منتهية",
  "status": 401
}
```

---

## استخدام Postman

### خطوات الإعداد:

1. **فتح Postman** وأنشئ Collection جديدة "NOW API"

2. **أضف البيانات الأساسية:**
   ```
   Collection Variables:
   - api_url: https://now-api-production.up.railway.app
   - token: (سيتم ملء هذا بعد Login)
   ```

3. **أنشئ Requests:**
   
   **Request: Get API Info**
   ```
   GET {{api_url}}/api
   ```
   
   **Request: Login**
   ```
   POST {{api_url}}/api/auth/login
   Body (raw JSON):
   {
     "phone": "+966500000000",
     "password": "password123",
     "role": "customer"
   }
   
   Tests (سيحفظ الـ Token تلقائياً):
   pm.environment.set("token", pm.response.json().data.token);
   ```
   
   **Request: Get My Profile**
   ```
   GET {{api_url}}/api/auth/me
   Headers:
   Authorization: Bearer {{token}}
   ```

---

## اختبار من التطبيق (Expo/React Native)

### تحديث البيئة:
```
mobile/.env
EXPO_PUBLIC_API_URL=https://now-api-production.up.railway.app/api
```

### اختبار من الكود:
```javascript
// services/api.js يجب أن يستخدم الـ URL الجديد تلقائياً

// اختبر هذا:
import api from './api';

const testAPI = async () => {
  try {
    // 1. اختبر الـ Health
    const health = await api.get('/health');
    console.log('Health:', health.data);
    
    // 2. اختبر المتاجر
    const stores = await api.get('/stores');
    console.log('Stores:', stores.data);
    
    // 3. اختبر Login
    const login = await api.post('/auth/login', {
      phone: '+966500000000',
      password: 'password123',
      role: 'customer'
    });
    console.log('Token:', login.data.data.token);
    
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
  }
};

testAPI();
```

---

## النتيجة المتوقعة النهائية

✅ جميع الـ Endpoints تعمل بدون أخطاء
✅ البيانات ترجع بشكل صحيح
✅ Authentication يعمل بدون مشاكل
✅ Error handling يرجع رسائل واضحة
✅ التطبيق يقرأ البيانات من السيرفر بنجاح

---

## خطوات إذا حصلت على مشاكل

1. **افتح Railway Logs:**
   - Deployments → Select → Logs
   
2. **ابحث عن الأخطاء:**
   - Error messages
   - Database connection issues
   - Environment variable issues
   
3. **إعادة Deploy:**
   - Push التعديلات الجديدة
   - انتظر 2-3 دقائق
   
4. **اختبر محلياً أولاً:**
   ```bash
   npm install
   npm run dev
   # اختبر من http://localhost:5000
   ```

