/* FalconAero — English / Arabic interface labels. Operational picture stays LTR (ICAO convention). */
(function (FA) {
  'use strict';
  const AR = {
    tagline: 'التعافي الذكي من الاضطرابات · مطارات الإمارات',
    'nav.ops': 'مركز العمليات', 'nav.plans': 'خطط التعافي', 'nav.network': 'شبكة الإمارات', 'nav.data': 'البيانات والأدلة', 'nav.lab': 'مختبر الابتكار', 'nav.gov': 'الذكاء الاصطناعي المسؤول', 'nav.impact': 'الأثر وخارطة الطريق',
    simtime: 'وقت المحاكاة', demo: 'عرض موجّه', scenario: 'سيناريو الاضطراب', wx: 'الطقس وتنبؤ الضباب بالذكاء الاصطناعي',
    labels: 'نداءات الطائرات', arrq: 'تدفق الوصول — الوقت المتوقع مقابل الهبوط', why: 'لماذا؟ — قرار قابل للتفسير'
  };
  const EN = {};
  let ar = false;
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((e) => {
      const key = e.dataset.i18n;
      if (!(key in EN)) EN[key] = e.textContent;
      e.textContent = ar && AR[key] ? AR[key] : EN[key];
    });
    document.body.classList.toggle('ar', ar);
    document.documentElement.lang = ar ? 'ar' : 'en';
    document.getElementById('langBtn').textContent = ar ? 'EN' : 'ع';
  }
  FA.i18n = { toggle() { ar = !ar; apply(); FA.ui.toast(ar ? 'العربية' : 'English', ar ? 'تم تفعيل واجهة اللغة العربية' : 'English interface', 'cy', 2000); }, isAr: () => ar };
  FA.views.i18n = { init() { document.getElementById('langBtn').onclick = FA.i18n.toggle; } };
})(window.FA);
