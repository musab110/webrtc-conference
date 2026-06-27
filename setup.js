const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 إعداد مشروع WebRTC Conference...');
console.log('🔐 إنشاء شهادات SSL مع OpenSSL 3.5.3...\n');

// إنشاء مجلد cert إذا لم يكن موجوداً
if (!fs.existsSync('cert')) {
    fs.mkdirSync('cert');
    console.log('✅ تم إنشاء مجلد cert');
}

// التحقق من وجود OpenSSL
try {
    const opensslVersion = execSync('openssl version', { encoding: 'utf8' });
    console.log(`✅ OpenSSL متاح: ${opensslVersion.trim()}`);
} catch (error) {
    console.log('❌ خطأ: OpenSSL غير متاح!');
    console.log('🔧 يرجى تثبيت OpenSSL 3.5.3 أولاً');
    process.exit(1);
}

// إنشاء المفتاح الخاص
console.log('🔑 إنشاء المفتاح الخاص...');
try {
    execSync('openssl genrsa -out cert/key.pem 2048', { stdio: 'inherit' });
    console.log('✅ تم إنشاء key.pem');
} catch (error) {
    console.log('❌ خطأ في إنشاء المفتاح الخاص');
    process.exit(1);
}

// إنشاء طلب الشهادة
console.log('📄 إنشاء طلب الشهادة...');
try {
    execSync('openssl req -new -key cert/key.pem -out cert/cert.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"', { stdio: 'inherit' });
    console.log('✅ تم إنشاء cert.csr');
} catch (error) {
    console.log('❌ خطأ في إنشاء طلب الشهادة');
    process.exit(1);
}

// إنشاء الشهادة الذاتية التوقيع
console.log('📜 إنشاء الشهادة الذاتية التوقيع...');
try {
    execSync('openssl x509 -req -days 365 -in cert/cert.csr -signkey cert/key.pem -out cert/cert.pem', { stdio: 'inherit' });
    console.log('✅ تم إنشاء cert.pem');
} catch (error) {
    console.log('❌ خطأ في إنشاء الشهادة');
    process.exit(1);
}

// تنظيف ملف CSR المؤقت
try {
    fs.unlinkSync('cert/cert.csr');
    console.log('🧹 تم حذف الملف المؤقت');
} catch (error) {
    // تجاهل خطأ حذف الملف المؤقت
}

// التحقق من صحة الشهادات
console.log('🔍 التحقق من صحة الشهادات...');
try {
    const certInfo = execSync('openssl x509 -in cert/cert.pem -text -noout', { encoding: 'utf8' });
    console.log('✅ الشهادة صالحة وتم التحقق منها');
} catch (error) {
    console.log('❌ خطأ في الشهادة:');
    console.log(error.message);
    process.exit(1);
}

// التحقق من الملفات الأساسية
const requiredFiles = ['server.js', 'public/index.html', 'public/client.js', 'public/style.css'];
let allFilesExist = true;

console.log('\n📁 فحص الملفات الأساسية...');
requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - مفقود!`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('❌ بعض الملفات الأساسية مفقودة!');
    process.exit(1);
}

// التحقق من إصدار Node.js
const nodeVersion = process.version;
console.log(`\n✅ Node.js version: ${nodeVersion}`);

// إنشاء ملف .env إذا لم يكن موجوداً
if (!fs.existsSync('.env')) {
    fs.writeFileSync('.env', 'PORT=3000\nSSL_KEY_PATH=cert/key.pem\nSSL_CERT_PATH=cert/cert.pem\nNODE_ENV=development');
    console.log('✅ تم إنشاء ملف .env');
}

console.log('\n🎉 جميع الفحوصات تمت بنجاح!');
console.log('📋 المشروع جاهز للتشغيل');
console.log('\n🚀 لتشغيل المشروع:');
console.log('   npm start');
console.log('\n🌐 سيتم تشغيل الخادم على: http://localhost:3000');
console.log('\n⚠️  ملاحظة: قد يظهر تحذير أمان في المتصفح لأن الشهادة ذاتية التوقيع');
console.log('   هذا طبيعي للتطوير. انقر على "متقدم" ثم "متابعة إلى localhost"');
console.log('\n📋 معلومات الشهادات:');
console.log('   - المفتاح الخاص: cert/key.pem');
console.log('   - الشهادة العامة: cert/cert.pem');
console.log('   - صالحة لمدة: 365 يوم');
console.log('   - الموقع: localhost');
