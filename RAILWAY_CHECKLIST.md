# ✅ قائمة تحقق - Railway Build Success

## قبل البناء

### متغيرات البيئة في Railroad Dashboard

تأكد من وجود:

```
☐ PORT=5000
☐ NODE_ENV=production
☐ CORS_ORIGIN=*
☐ JWT_SECRET=your_secure_key_here
☐ DATABASE_URL=postgresql://...
☐ DIRECT_URL=postgresql://... (إن وجدت)
```

### الملفات الضرورية

```
☐ Procfile (موجود)
☐ .railwayignore (موجود)
☐ railway.json (موجود أو اختياري)
☐ package.json (build script محدث)
☐ server.js (CORS_ORIGIN آمن)
```

### Git Status

```bash
☐ git add -A
☐ git commit -m "Fix: Railway build"
☐ git push origin master
```

---

## أثناء البناء

### في Railroad Logs

```
☐ [1/5] Starting build...
☐ [2/5] Installing dependencies...
☐ [3/5] Running build command (npm run build)
☐ [4/5] Creating container...
☐ [5/5] Deploying...
```

### ابحث عن ✅

```
✅ Build completed successfully
✅ Deployment successful
✅ Application is running
✅ Database connected
```

### تجنب ❌

```
❌ secret CORS_ORIGIN not found
❌ Failed to build
❌ Database connection error
❌ Module not found
```

---

## بعد البناء الناجح

### 1. فحص الـ URL

```bash
# يجب أن تحصل على response
curl https://your-railway-app.up.railway.app

# يجب أن يرجع JSON
curl https://your-railway-app.up.railway.app/api
```

### 2. اختبر Health

```bash
curl https://your-railway-app.up.railway.app/api/health
```

**الرد المتوقع:**
```json
{
  "success": true,
  "data": {
    "status": "online",
    "database": "connected"
  }
}
```

### 3. اختبر الـ Stores

```bash
curl https://your-railway-app.up.railway.app/api/stores
```

**يجب أن يرجع قائمة أو مصفوفة فارغة:**
```json
{
  "success": true,
  "data": [...]
}
```

---

## استكشاف الأخطاء

### ❌ `Build failed`

**الحل:**
1. افتح Logs في Railway
2. ابحث عن error message
3. تحقق من متغيرات البيئة
4. تأكد من `DATABASE_URL` صحيحة

### ❌ `secret CORS_ORIGIN not found`

**يعني التعديلات لم تُطبق:**
1. تأكد من أن `Procfile` موجود
2. تأكد من أن `package.json` محدث
3. اعمل `git push` مرة أخرى
4. انتظر 3-5 دقائق

### ❌ `Database connection error`

**تحقق من:**
1. `DATABASE_URL` موجودة وصحيحة
2. Database نشطة وتعمل
3. Firewall لا يحجب الاتصال
4. جرب إعادة Deploy

### ❌ `Port already in use`

**الحل:**
```
Railway يختار port تلقائياً
لا تحدد port معين في الكود
استخدم: process.env.PORT || 5000
```

---

## نصائح للـ Production

✅ **استخدم Strong JWT_SECRET:**
```bash
openssl rand -base64 32
```

✅ **تفعيل Database Backups**

✅ **مراقبة Logs بانتظام**

✅ **استخدم Custom Domain**

✅ **فعّل HTTPS**

---

## الملفات المهمة

| الملف | الوصف |
|------|-------|
| `Procfile` | تعليمات البدء |
| `.railwayignore` | تجاهل ملفات Vercel |
| `railway.json` | إعدادات صريحة |
| `package.json` | build script محدث |
| `server.js` | CORS آمن |

---

## الأوامر المفيدة

### مراقبة الـ Logs محلياً
```bash
npm run dev
```

### اختبار البناء محلياً
```bash
npm run build
npm start
```

### اختبار من Postman
```
GET https://your-app.up.railway.app/api
Authorization: Bearer TOKEN
```

---

## النتيجة المتوقعة

✅ Build ينجح بدون أخطاء  
✅ التطبيق يبدأ بنجاح  
✅ Database متصل  
✅ جميع endpoints تعمل  
✅ CORS يسمح بالطلبات  

**🎉 مبروك! المشروع على الهواء!**
