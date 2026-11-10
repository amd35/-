"use strict";

const FAQ_ITEMS = [
  {
    q: "كيف أضيف غرفة جديدة؟",
    a: "افتح صفحة «إضافة عنصر»، أدخل اسم الغرفة والمضيف وعدد المشاركين، ثم اضغط «حفظ العنصر». ستجدها فوراً في صفحة «البيانات».",
  },
  {
    q: "كيف أبحث عن عنصر معيّن؟",
    a: "من صفحة «البيانات» استخدم حقل البحث بالاسم أو باسم المضيف، أو رشّح النتائج بحسب الحالة (مباشر، مجدول، مغلق).",
  },
  {
    q: "ما الفرق بين الغرفة المباشرة والمجدولة؟",
    a: "المباشرة تعمل الآن ويظهر عدد حضورها لحظياً، أما المجدولة فلم تبدأ بعد ويمكنك تعديل حالتها لاحقاً.",
  },
  {
    q: "كيف أعلّم مهمة كمنتهية؟",
    a: "من صفحة «المهام» اضغط المربع بجانب المهمة، وسيتحدّث شريط الإنجاز والأرقام أعلى الصفحة مباشرة.",
  },
  {
    q: "هل تُحفظ بياناتي بعد إغلاق المتصفح؟",
    a: "نعم، تُحفظ الغرف والمهام والتفضيلات في متصفحك نفسه، وتبقى كما هي عند العودة إليه.",
  },
  {
    q: "كيف أعيد البيانات إلى حالتها الأصلية؟",
    a: "من صفحة «الإعدادات» اضغط زر «إعادة تعيين البيانات» لإرجاع كل شيء إلى القيم الافتراضية.",
  },
];

export default {
  title: "الأسئلة الشائعة",
  subtitle: "أجوبة سريعة عن أكثر ما يُسأل",

  render(root) {
    root.innerHTML =
      '<section class="card">' +
        '<input id="faq-search" class="input" type="search" placeholder="ابحث في الأسئلة…" aria-label="بحث في الأسئلة" />' +
        '<div class="faq" id="faq-list"></div>' +
      "</section>";

    const list = root.querySelector("#faq-list");

    const paint = () => {
      const term = root.querySelector("#faq-search").value.trim().toLowerCase();
      const items = FAQ_ITEMS.filter(
        (item) => !term || item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)
      );
      list.innerHTML =
        items
          .map(
            (item) =>
              "<details><summary>" + item.q + "</summary><p>" + item.a + "</p></details>"
          )
          .join("") || '<p class="empty">لا أسئلة مطابقة.</p>';
    };

    root.querySelector("#faq-search").addEventListener("input", paint);
    paint();
  },
};
