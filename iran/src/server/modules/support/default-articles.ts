/**
 * The help articles the assistant starts with (the platform team edits them afterwards in
 * /admin/support). `{base}` in a link becomes the hotel's dashboard (`/dashboard/{id}`).
 */
type L = { fa: string; en: string; fr: string; ar: string };
export type DefaultArticle = {
  slug: string;
  audience: "staff" | "guest";
  title: L;
  body: L;
  keywords: string;
  href: string | null;
};

export const DEFAULT_ARTICLES: DefaultArticle[] = [
  // ── Hotels and restaurants (staff) ─────────────────────────────────────────
  {
    slug: "night-audit",
    audience: "staff",
    title: {
      fa: "بستن روز (حسابرسی شب)",
      en: "Closing the day (night audit)",
      fr: "Clôturer la journée (audit de nuit)",
      ar: "إغلاق اليوم (التدقيق الليلي)",
    },
    body: {
      fa: "در صفحه پذیرش، دکمه «بستن روز» شب‌های اقامت را ثبت، عدم‌حضورها را مشخص و تاریخ کاری را یک روز جلو می‌برد. اگر خروجی‌های امروز هنوز انجام نشده باشند، ابتدا آن‌ها را تسویه کنید.",
      en: "On the front desk page, “Close the day” posts the room nights, marks no-shows and moves the business date forward. If today's departures are still pending, check them out first.",
      fr: "Sur la page Réception, « Clôturer la journée » porte les nuitées, marque les non-présentés et avance la date d'exploitation. S'il reste des départs du jour, faites-les d'abord.",
      ar: "في صفحة الاستقبال، يقوم زر «إغلاق اليوم» بتسجيل الليالي وتحديد عدم الحضور وتقديم تاريخ العمل يوماً. إذا بقيت مغادرات اليوم، أنجزها أولاً.",
    },
    keywords:
      "بستن روز,حسابرسی شب,ممیزی شب,تاریخ کاری,روز بسته نمیشود,night audit,close the day,business date,end of day,audit de nuit,clôture,clôturer,date d'exploitation,إغلاق اليوم,التدقيق الليلي",
    href: "{base}/frontdesk",
  },
  {
    slug: "check-in",
    audience: "staff",
    title: {
      fa: "پذیرش مهمان",
      en: "Checking a guest in",
      fr: "Enregistrer l'arrivée d'un client",
      ar: "تسجيل وصول نزيل",
    },
    body: {
      fa: "در صفحه پذیرش، فهرست ورودی‌های امروز را ببینید و روی «پذیرش» بزنید: اتاق، مدارک و پرداخت در سه مرحله ثبت می‌شود. برای مهمان بدون رزرو از «رزرو و پذیرش فوری» در صفحه رزرو جدید استفاده کنید.",
      en: "On the front desk page, open today's arrivals and tap “Check in”: room, documents and payment in three steps. For a walk-in, use “Book and check in now” on the new booking page.",
      fr: "Sur la page Réception, ouvrez les arrivées du jour et touchez « Enregistrer » : chambre, pièces d'identité et paiement en trois étapes. Pour un client sans réservation, utilisez « Réserver et enregistrer » sur la page Nouvelle réservation.",
      ar: "في صفحة الاستقبال، افتح وصول اليوم واضغط «تسجيل الوصول»: الغرفة والمستندات والدفع في ثلاث خطوات. للنزيل بدون حجز استخدم «حجز وتسجيل فوري».",
    },
    keywords:
      "پذیرش,چک این,ورود مهمان,مهمان بدون رزرو,check in,check-in,walk in,arrival,arrivée,enregistrer,sans réservation,تسجيل الوصول,وصول",
    href: "{base}/frontdesk",
  },
  {
    slug: "check-out",
    audience: "staff",
    title: {
      fa: "خروج مهمان و تسویه",
      en: "Checking out and settling the bill",
      fr: "Départ et règlement de la note",
      ar: "المغادرة وتسوية الفاتورة",
    },
    body: {
      fa: "«تسویه و خروج» شب‌های باقی‌مانده را ثبت می‌کند؛ اگر پیام «مانده است» آمد، همان مبلغ را با «دریافت وجه» بگیرید و دوباره بزنید. برای مهمانان شرکتی «انتقال به حساب شرکت» را بزنید.",
      en: "“Settle and check out” posts the remaining nights; if it says an amount is still due, take that amount with “Take payment” and try again. For company guests, use “Transfer to company account”.",
      fr: "« Régler et départ » porte les nuitées restantes ; s'il indique un montant restant dû, encaissez-le avec « Encaisser » puis recommencez. Pour un client société, utilisez « Transférer au compte société ».",
      ar: "«تسوية ومغادرة» يسجل الليالي المتبقية؛ إذا ظهر مبلغ متبقٍ، استلمه عبر «استلام مبلغ» ثم أعد المحاولة. لنزلاء الشركات استخدم «تحويل إلى حساب الشركة».",
    },
    keywords:
      "خروج,چک اوت,تسویه,تسویه نشده,مانده است,صورتحساب باز,check out,checkout,settle,not settled,still due,départ,régler,note non soldée,reste dû,مغادرة,تسوية",
    href: "{base}/frontdesk",
  },
  {
    slug: "new-booking",
    audience: "staff",
    title: { fa: "ثبت رزرو جدید", en: "Making a booking", fr: "Créer une réservation", ar: "إنشاء حجز" },
    body: {
      fa: "در «رزرو جدید» تاریخ و تعداد نفرات را وارد کنید؛ همه اتاق‌های خالی و نرخ‌ها نمایش داده می‌شود. در جدول اتاق‌ها هم می‌توانید با کشیدن روی روزها رزرو بسازید.",
      en: "On “New booking”, enter dates and guests: every free room type and rate is shown. On the room planning you can also drag across days to book.",
      fr: "Dans « Nouvelle réservation », saisissez les dates et le nombre de personnes : toutes les chambres libres et tous les tarifs s'affichent. Sur le planning, vous pouvez aussi glisser sur les jours pour réserver.",
      ar: "في «حجز جديد» أدخل التواريخ وعدد الأشخاص لتظهر كل الغرف المتاحة والأسعار. ويمكنك في جدول الغرف السحب على الأيام للحجز.",
    },
    keywords:
      "رزرو جدید,ثبت رزرو,رزرو کنم,booking,reservation,new booking,book a room,réservation,réserver,حجز,حجز جديد",
    href: "{base}/stays/new",
  },
  {
    slug: "move-room",
    audience: "staff",
    title: {
      fa: "جابه‌جایی اتاق",
      en: "Moving a guest to another room",
      fr: "Changer un client de chambre",
      ar: "نقل نزيل إلى غرفة أخرى",
    },
    body: {
      fa: "در صفحه رزرو «جابه‌جایی اتاق» را بزنید یا در جدول اتاق‌ها رزرو را بکشید و روی اتاق دیگر رها کنید.",
      en: "On the booking, tap “Move room”, or drag the booking onto another room on the room planning.",
      fr: "Sur la réservation, touchez « Changer de chambre », ou faites glisser la réservation sur une autre chambre dans le planning.",
      ar: "في صفحة الحجز اضغط «نقل الغرفة»، أو اسحب الحجز إلى غرفة أخرى في جدول الغرف.",
    },
    keywords:
      "جابه جایی,جابجایی اتاق,تغییر اتاق,move room,change room,room change,changer de chambre,déplacer,نقل الغرفة,تغيير الغرفة",
    href: "{base}/planning",
  },
  {
    slug: "qr-codes",
    audience: "staff",
    title: {
      fa: "چاپ کدهای QR",
      en: "Printing the QR codes",
      fr: "Imprimer les QR codes",
      ar: "طباعة رموز QR",
    },
    body: {
      fa: "در «میزها و اتاق‌ها» گزینه چاپ، کد QR همه اتاق‌ها یا میزها را آماده چاپ می‌کند. اگر کدی لو رفت، آن را از صفحه همان اتاق دوباره بسازید.",
      en: "In “Tables & rooms”, Print prepares the QR code of every room or table. If a code leaked, regenerate it from that room's page.",
      fr: "Dans « Tables et chambres », Imprimer prépare le QR code de chaque chambre ou table. Si un code a fuité, régénérez-le depuis la page de la chambre.",
      ar: "في «الطاولات والغرف» يجهّز زر الطباعة رمز QR لكل غرفة أو طاولة. إذا تسرب رمز، أعد إنشاءه من صفحة الغرفة.",
    },
    keywords: "کد qr,کیوآر,چاپ qr,qr code,print qr,qr codes,imprimer qr,qr,رمز qr,باركود",
    href: "{base}/tables/print",
  },
  {
    slug: "printer",
    audience: "staff",
    title: {
      fa: "چاپگر آشپزخانه چاپ نمی‌کند",
      en: "The kitchen printer does not print",
      fr: "L'imprimante cuisine n'imprime pas",
      ar: "طابعة المطبخ لا تطبع",
    },
    body: {
      fa: "در تنظیمات > چاپگرها، آدرس IP و پورت (معمولاً 9100) را بررسی کنید و «چاپ آزمایشی» بزنید. چاپگر و رایانه/برنامه چاپ باید در یک شبکه باشند و برنامه چاپ روشن باشد.",
      en: "In Settings › Printers, check the IP address and port (usually 9100) and send a test print. The printer and the print agent must be on the same network, with the agent running.",
      fr: "Dans Paramètres › Imprimantes, vérifiez l'adresse IP et le port (souvent 9100) puis lancez une impression test. L'imprimante et l'agent d'impression doivent être sur le même réseau, l'agent allumé.",
      ar: "في الإعدادات › الطابعات، تحقق من عنوان IP والمنفذ (عادة 9100) وأرسل طباعة تجريبية. يجب أن تكون الطابعة وبرنامج الطباعة على الشبكة نفسها مع تشغيل البرنامج.",
    },
    keywords:
      "چاپگر,پرینتر,فیش,چاپ نمیکند,چاپ نمی کند,printer,print,not printing,ticket,imprimante,imprime pas,impression,طابعة,لا تطبع",
    href: "{base}/settings#printing",
  },
  {
    slug: "menu",
    audience: "staff",
    title: {
      fa: "ویرایش منو، قیمت و عکس غذا",
      en: "Editing the menu, prices and photos",
      fr: "Modifier la carte, les prix et les photos",
      ar: "تعديل القائمة والأسعار والصور",
    },
    body: {
      fa: "در «منو» دسته‌ها و غذاها را اضافه یا ویرایش کنید؛ روی هر غذا قیمت، عکس، ناموجود بودن و گزینه‌ها را تنظیم کنید. تغییرات فوراً روی گوشی مهمانان دیده می‌شود.",
      en: "In “Menu”, add or edit categories and dishes; on each dish set price, photo, sold out and options. Changes show on guests' phones at once.",
      fr: "Dans « Carte », ajoutez ou modifiez catégories et plats ; sur chaque plat réglez prix, photo, rupture et options. Les changements apparaissent aussitôt chez les clients.",
      ar: "في «القائمة» أضف أو عدّل الفئات والأطباق؛ وحدد لكل طبق السعر والصورة ونفاد الكمية والخيارات. تظهر التغييرات فوراً على هواتف الضيوف.",
    },
    keywords:
      "منو,غذا,قیمت غذا,عکس غذا,ناموجود,menu,dish,price,photo,sold out,carte,plat,prix,rupture,قائمة,طبق,سعر",
    href: "{base}/menu",
  },
  {
    slug: "team",
    audience: "staff",
    title: {
      fa: "افزودن کارمند و دسترسی‌ها",
      en: "Adding staff and access rights",
      fr: "Ajouter un employé et ses accès",
      ar: "إضافة موظف وصلاحياته",
    },
    body: {
      fa: "در «تیم» کارمند را با موبایل یا ایمیل دعوت کنید و نقش (مدیر، پذیرش، خانه‌داری، آشپزخانه…) را انتخاب کنید. هر نقش فقط صفحه‌های خودش را می‌بیند.",
      en: "In “Team”, invite the person by mobile or email and choose a role (manager, front desk, housekeeping, kitchen…). Each role only sees its own pages.",
      fr: "Dans « Équipe », invitez la personne par mobile ou e-mail et choisissez un rôle (direction, réception, ménage, cuisine…). Chaque rôle ne voit que ses pages.",
      ar: "في «الفريق» ادعُ الشخص برقم الجوال أو البريد واختر الدور (مدير، استقبال، تدبير، مطبخ…). كل دور يرى صفحاته فقط.",
    },
    keywords:
      "کارمند,تیم,دسترسی,نقش,اضافه کردن کاربر,staff,team,role,access,permission,add user,employé,équipe,rôle,accès,موظف,فريق,صلاحية",
    href: "{base}/team",
  },
  {
    slug: "password",
    audience: "staff",
    title: {
      fa: "رمز عبور را فراموش کرده‌ام",
      en: "I forgot my password",
      fr: "J'ai oublié mon mot de passe",
      ar: "نسيت كلمة المرور",
    },
    body: {
      fa: "در صفحه ورود، با شماره موبایل و کد پیامکی وارد شوید. اگر کارمند هستید، مدیر هتل می‌تواند از صفحه «تیم» دسترسی شما را دوباره بفرستد.",
      en: "On the sign-in page, sign in with your mobile number and the SMS code. Staff can also ask their manager to resend their access from the Team page.",
      fr: "Sur la page de connexion, connectez-vous avec votre numéro de mobile et le code SMS. Un employé peut aussi demander à son responsable de renvoyer son accès depuis la page Équipe.",
      ar: "في صفحة الدخول، ادخل برقم الجوال والرمز المرسل برسالة. ويمكن للموظف أن يطلب من مديره إعادة إرسال الدخول من صفحة الفريق.",
    },
    keywords:
      "رمز,پسورد,فراموش,ورود نمیشود,نمیتوانم وارد شوم,password,forgot,login,sign in,mot de passe,oublié,connexion,كلمة المرور,نسيت,تسجيل الدخول",
    href: "/login",
  },
  {
    slug: "housekeeping",
    audience: "staff",
    title: {
      fa: "خانه‌داری و وضعیت اتاق‌ها",
      en: "Housekeeping and room status",
      fr: "Ménage et état des chambres",
      ar: "التدبير الفندقي وحالة الغرف",
    },
    body: {
      fa: "در «خانه‌داری» برنامه امروز را بین مستخدمان تقسیم کنید؛ هر نفر از گوشی خود اتاق را «تمیز» یا «بازرسی‌شده» می‌کند و پذیرش فوراً می‌بیند.",
      en: "In “Housekeeping”, share today's plan between attendants; each one marks rooms clean or inspected from their phone and the front desk sees it at once.",
      fr: "Dans « Ménage », répartissez le plan du jour entre les femmes de chambre ; chacune marque les chambres propres ou contrôlées depuis son téléphone et la réception le voit aussitôt.",
      ar: "في «التدبير الفندقي» وزّع خطة اليوم على العاملين؛ يحدد كل منهم الغرفة نظيفة أو مفحوصة من هاتفه وتراها الاستقبال فوراً.",
    },
    keywords:
      "خانه داری,نظافت,اتاق کثیف,تمیز,مستخدم,housekeeping,dirty,clean,cleaning,room status,ménage,sale,propre,femme de chambre,تدبير,تنظيف,نظيفة",
    href: "{base}/housekeeping",
  },
  {
    slug: "cashier",
    audience: "staff",
    title: {
      fa: "صندوق، شیفت و تحویل صندوق",
      en: "Cash desk, shifts and handover",
      fr: "Caisse, services et passation",
      ar: "الصندوق والورديات والتسليم",
    },
    body: {
      fa: "در «صندوق» شیفت را با موجودی اول باز کنید؛ در پایان، شمارش و «تحویل صندوق» گزارش اختلاف را ثبت می‌کند و در «چشم مالک» دیده می‌شود.",
      en: "In “Cash desk”, open the shift with the opening float; at the end, the count and “Handover” record any difference, which shows in Owner's eye.",
      fr: "Dans « Caisse », ouvrez le service avec le fond de caisse ; à la fin, le comptage et la « Passation » enregistrent l'écart, visible dans l'Œil du propriétaire.",
      ar: "في «الصندوق» افتح الوردية بالرصيد الافتتاحي؛ وفي النهاية يسجل العدّ و«التسليم» أي فرق يظهر في «عين المالك».",
    },
    keywords:
      "صندوق,شیفت,تحویل صندوق,کسری,cash,cashier,shift,handover,float,shortage,caisse,service,passation,écart,صندوق,وردية,عجز",
    href: "{base}/cashier",
  },
  {
    slug: "invoice",
    audience: "staff",
    title: {
      fa: "فاکتور رسمی (سامانه مودیان)",
      en: "Official invoice (tax system)",
      fr: "Facture officielle (système fiscal)",
      ar: "الفاتورة الرسمية (النظام الضريبي)",
    },
    body: {
      fa: "پس از تسویه، در صورتحساب اقامت «صدور فاکتور رسمی» را بزنید و مشخصات خریدار (شخص یا شرکت) را وارد کنید؛ فاکتور با شماره رسمی و PDF آماده می‌شود.",
      en: "Once settled, tap “Issue official invoice” on the stay's bill and enter the buyer (person or company); the invoice gets its official number and a PDF.",
      fr: "Une fois la note réglée, touchez « Émettre la facture officielle » et saisissez l'acheteur (particulier ou société) ; la facture reçoit son numéro officiel et un PDF.",
      ar: "بعد التسوية اضغط «إصدار فاتورة رسمية» في فاتورة الإقامة وأدخل المشتري (فرد أو شركة)؛ تحصل الفاتورة على رقمها الرسمي وملف PDF.",
    },
    keywords:
      "فاکتور,فاکتور رسمی,مودیان,صورتحساب رسمی,invoice,official invoice,tax,facture,facture officielle,فاتورة,فاتورة رسمية",
    href: "{base}/invoices",
  },
  {
    slug: "reports",
    audience: "staff",
    title: {
      fa: "گزارش‌های روزانه و مدیریتی",
      en: "Daily and management reports",
      fr: "Rapports quotidiens et de direction",
      ar: "التقارير اليومية والإدارية",
    },
    body: {
      fa: "«گزارش‌های هتل» گزارش مدیر، اشغال، فروش روزانه، مهمانان بدهکار و… را برای هر روز یا بازه نشان می‌دهد و قابل چاپ و خروجی اکسل است.",
      en: "“Hotel reports” shows the manager's report, occupancy, daily sales, debtors and more for any day or period, printable and exportable.",
      fr: "« Rapports hôtel » donne le rapport de direction, l'occupation, les ventes du jour, les débiteurs… pour un jour ou une période, imprimables et exportables.",
      ar: "«تقارير الفندق» تعرض تقرير المدير والإشغال والمبيعات اليومية والمدينين لأي يوم أو فترة، قابلة للطباعة والتصدير.",
    },
    keywords:
      "گزارش,گزارش روزانه,اشغال,فروش,اکسل,report,reports,occupancy,daily sales,export,rapport,occupation,ventes,تقرير,إشغال,مبيعات",
    href: "{base}/hotel-reports",
  },
  {
    slug: "rates",
    audience: "staff",
    title: {
      fa: "تغییر نرخ اتاق‌ها",
      en: "Changing room rates",
      fr: "Modifier les tarifs des chambres",
      ar: "تغيير أسعار الغرف",
    },
    body: {
      fa: "در «هتل» > «نرخ‌ها» قیمت هر نوع اتاق را برای یک بازه تاریخ تنظیم کنید. با «سپر ریال» می‌توانید نرخ را به دلار، یورو یا سکه وصل کنید.",
      en: "In “Hotel › Rates”, set each room type's price for a date range. With “Rial shield” you can tie a rate to the dollar, euro or gold coin.",
      fr: "Dans « Hôtel › Tarifs », réglez le prix de chaque type de chambre sur une période. Avec le « Bouclier rial », vous pouvez indexer un tarif sur le dollar, l'euro ou l'or.",
      ar: "في «الفندق › الأسعار» حدد سعر كل نوع غرفة لفترة. ومع «درع الريال» يمكن ربط السعر بالدولار أو اليورو أو الذهب.",
    },
    keywords:
      "نرخ,قیمت اتاق,تغییر قیمت,تعرفه,rate,rates,room price,pricing,tarif,prix chambre,سعر الغرفة,أسعار",
    href: "{base}/hotel?tab=rates",
  },
  {
    slug: "billing",
    audience: "staff",
    title: {
      fa: "اشتراک و پرداخت Spotihotel",
      en: "Your Spotihotel subscription",
      fr: "Votre abonnement Spotihotel",
      ar: "اشتراكك في Spotihotel",
    },
    body: {
      fa: "در «اشتراک» طرح فعلی، تاریخ تمدید و فاکتورها را ببینید و آنلاین تمدید کنید. اگر پرداخت انجام شد ولی اشتراک فعال نشد، همین‌جا برای ما بنویسید.",
      en: "In “Subscription”, see your plan, renewal date and invoices, and renew online. If you paid but the plan is not active, write to us right here.",
      fr: "Dans « Abonnement », voyez votre formule, la date de renouvellement et les factures, et renouvelez en ligne. Si vous avez payé mais que l'abonnement n'est pas actif, écrivez-nous ici.",
      ar: "في «الاشتراك» ترى خطتك وتاريخ التجديد والفواتير ويمكنك التجديد عبر الإنترنت. إذا دفعت ولم يتفعّل الاشتراك، اكتب لنا هنا.",
    },
    keywords:
      "اشتراک,تمدید,پرداخت اشتراک,طرح,پلن,subscription,plan,renew,billing,payment,abonnement,renouveler,formule,اشتراك,تجديد",
    href: "{base}/billing",
  },
  {
    slug: "guests-cannot-order",
    audience: "staff",
    title: {
      fa: "مهمان می‌گوید نمی‌تواند سفارش دهد",
      en: "A guest says they cannot order",
      fr: "Un client dit qu'il ne peut pas commander",
      ar: "ضيف يقول إنه لا يستطيع الطلب",
    },
    body: {
      fa: "هر اسکن کد QR فقط ۳۰ دقیقه امکان سفارش می‌دهد؛ از مهمان بخواهید دوباره کد را اسکن کند. اگر کد QR غیرفعال است، آن را در صفحه همان اتاق یا میز فعال کنید.",
      en: "Each QR scan allows ordering for 30 minutes only: ask the guest to scan the code again. If the QR code is disabled, enable it on that room's or table's page.",
      fr: "Chaque scan du QR code permet de commander pendant 30 minutes : demandez au client de rescanner. Si le QR code est désactivé, réactivez-le sur la page de la chambre ou de la table.",
      ar: "كل مسح لرمز QR يتيح الطلب 30 دقيقة فقط: اطلب من الضيف إعادة المسح. وإذا كان الرمز معطلاً ففعّله من صفحة الغرفة أو الطاولة.",
    },
    keywords:
      "سفارش نمیدهد,نمیتواند سفارش,مهلت,۳۰ دقیقه,30 دقیقه,qr کار نمیکند,cannot order,can't order,qr not working,30 minutes,ne peut pas commander,qr ne marche pas,لا يستطيع الطلب",
    href: "{base}/tables",
  },
  {
    slug: "tips",
    audience: "staff",
    title: {
      fa: "تحویل انعام کارکنان",
      en: "Handing tips to staff",
      fr: "Remettre les pourboires",
      ar: "تسليم البقشيش للموظفين",
    },
    body: {
      fa: "در «انعام کارکنان» مجموع انعام هر نفر و مانده تحویل‌نشده را ببینید و با «تحویل شد» علامت بزنید. انعامی که از صورتحساب حذف شود، خودبه‌خود کم می‌شود.",
      en: "In “Staff tips”, see each person's total and what is still to hand over, and mark it handed. A tip voided on the bill is removed automatically.",
      fr: "Dans « Pourboires », voyez le total de chacun et ce qui reste à remettre, puis marquez « remis ». Un pourboire annulé sur la note est retiré automatiquement.",
      ar: "في «بقشيش الموظفين» ترى مجموع كل شخص وما بقي للتسليم وتحدده كمُسلَّم. البقشيش الملغى من الفاتورة يُحذف تلقائياً.",
    },
    keywords: "انعام,تیپ,tip,tips,gratuity,pourboire,pourboires,بقشيش",
    href: "{base}/tips",
  },

  // ── Guests (after the QR scan) ─────────────────────────────────────────────
  {
    slug: "guest-order",
    audience: "guest",
    title: { fa: "چطور سفارش بدهم؟", en: "How do I order?", fr: "Comment commander ?", ar: "كيف أطلب؟" },
    body: {
      fa: "رستوران را انتخاب کنید، با + غذا را به سبد اضافه کنید و «ثبت سفارش» را بزنید. وضعیت سفارش را در «سفارش‌های من» دنبال کنید.",
      en: "Choose a restaurant, add dishes with +, then tap “Place order”. Follow it under “My orders”.",
      fr: "Choisissez un restaurant, ajoutez les plats avec +, puis touchez « Commander ». Suivez-la dans « Mes commandes ».",
      ar: "اختر المطعم وأضف الأطباق بزر + ثم اضغط «تأكيد الطلب». تابع الطلب في «طلباتي».",
    },
    keywords:
      "سفارش,سفارش بدهم,غذا,منو,سرویس اتاق,order,menu,room service,food,commander,commande,carte,طلب,قائمة,خدمة الغرف",
    href: "/table",
  },
  {
    slug: "guest-scan-again",
    audience: "guest",
    title: {
      fa: "دکمه سفارش کار نمی‌کند",
      en: "Ordering does not work",
      fr: "Je n'arrive pas à commander",
      ar: "الطلب لا يعمل",
    },
    body: {
      fa: "هر اسکن کد QR ۳۰ دقیقه امکان سفارش می‌دهد. کد QR اتاق یا میز را دوباره اسکن کنید؛ سبد شما حفظ می‌شود.",
      en: "Each scan of the QR code lets you order for 30 minutes. Scan the room's or table's QR code again; your cart is kept.",
      fr: "Chaque scan du QR code permet de commander pendant 30 minutes. Scannez à nouveau le QR code de la chambre ou de la table ; votre panier est conservé.",
      ar: "كل مسح لرمز QR يتيح الطلب لمدة 30 دقيقة. امسح رمز الغرفة أو الطاولة مرة أخرى؛ سلتك محفوظة.",
    },
    keywords:
      "کار نمیکند,نمیتوانم سفارش,مهلت,اسکن,خطا,doesn't work,not working,cannot order,scan,error,ne marche pas,ne fonctionne pas,scanner,erreur,لا يعمل,مسح,خطأ",
    href: null,
  },
  {
    slug: "guest-bill",
    audience: "guest",
    title: {
      fa: "دیدن و پرداخت صورتحساب",
      en: "Seeing and paying my bill",
      fr: "Voir et régler ma note",
      ar: "عرض الفاتورة ودفعها",
    },
    body: {
      fa: "در «اقامت من» بخش صورتحساب، یک بار نام خانوادگی خود را وارد کنید تا جزئیات و مانده را ببینید. پرداخت را آنلاین یا هنگام خروج در پذیرش انجام دهید.",
      en: "In “My stay”, bill section, type your last name once to see the details and balance. Pay online or at the front desk when you leave.",
      fr: "Dans « Mon séjour », rubrique Note, saisissez une fois votre nom de famille pour voir le détail et le solde. Réglez en ligne ou à la réception au départ.",
      ar: "في «إقامتي» قسم الفاتورة، اكتب اسم العائلة مرة واحدة لترى التفاصيل والرصيد. ادفع عبر الإنترنت أو في الاستقبال عند المغادرة.",
    },
    keywords:
      "صورتحساب,پرداخت,حساب,مانده,فاکتور,bill,pay,payment,balance,invoice,note,payer,facture,solde,فاتورة,دفع,حساب",
    href: "/table/stay#bill",
  },
  {
    slug: "guest-reception",
    audience: "guest",
    title: {
      fa: "درخواست از پذیرش یا خانه‌داری",
      en: "Asking the front desk or housekeeping",
      fr: "Demander quelque chose à la réception",
      ar: "طلب من الاستقبال أو التدبير",
    },
    body: {
      fa: "در «اقامت من» دکمه «تماس با پذیرش» یا «نظافت و درخواست» را بزنید (حوله، نظافت، تعمیر…). یا همین‌جا بنویسید تا پذیرش پاسخ دهد.",
      en: "In “My stay”, tap “Call the front desk” or “Cleaning & requests” (towels, cleaning, repair…). Or write here and the front desk will reply.",
      fr: "Dans « Mon séjour », touchez « Appeler la réception » ou « Ménage et demandes » (serviettes, ménage, réparation…). Ou écrivez ici, la réception vous répondra.",
      ar: "في «إقامتي» اضغط «اتصل بالاستقبال» أو «التنظيف والطلبات» (مناشف، تنظيف، إصلاح…). أو اكتب هنا وسيرد الاستقبال.",
    },
    keywords:
      "حوله,نظافت,تعمیر,خراب,پذیرش,درخواست,کولر,آب گرم,towel,cleaning,repair,broken,reception,request,air conditioning,serviette,ménage,réparation,cassé,réception,منشفة,تنظيف,إصلاح,استقبال",
    href: "/table/stay",
  },
  {
    slug: "guest-checkout",
    audience: "guest",
    title: { fa: "ساعت خروج", en: "Check-out time", fr: "Heure de départ", ar: "وقت المغادرة" },
    body: {
      fa: "ساعت خروج روی کارت اتاق در صفحه اصلی نوشته شده است. برای تأخیر در خروج، از پذیرش درخواست کنید.",
      en: "The check-out time is on the room card at the top of the page. For a late check-out, ask the front desk.",
      fr: "L'heure de départ figure sur la carte de la chambre en haut de la page. Pour un départ tardif, demandez à la réception.",
      ar: "وقت المغادرة مكتوب على بطاقة الغرفة أعلى الصفحة. للمغادرة المتأخرة اطلب من الاستقبال.",
    },
    keywords:
      "ساعت خروج,خروج,چک اوت,تاخیر,check out,checkout,late check out,départ,heure de départ,départ tardif,مغادرة,وقت المغادرة",
    href: "/table/stay",
  },
  {
    slug: "guest-spa",
    audience: "guest",
    title: {
      fa: "رزرو اسپا، استخر یا ماساژ",
      en: "Booking the spa, pool or a massage",
      fr: "Réserver le spa, la piscine ou un massage",
      ar: "حجز السبا أو المسبح أو التدليك",
    },
    body: {
      fa: "در «اقامت من» بخش اسپا، روز و سانس را انتخاب کنید؛ مبلغ به صورتحساب اتاق اضافه می‌شود.",
      en: "In “My stay”, spa section, pick a day and a time slot; the price goes on your room bill.",
      fr: "Dans « Mon séjour », rubrique Spa, choisissez le jour et le créneau ; le prix est ajouté à la note de la chambre.",
      ar: "في «إقامتي» قسم السبا اختر اليوم والموعد؛ يضاف المبلغ إلى فاتورة الغرفة.",
    },
    keywords: "اسپا,استخر,ماساژ,سونا,spa,pool,massage,sauna,piscine,سبا,مسبح,تدليك,ساونا",
    href: "/table/stay#spa",
  },
  {
    slug: "guest-minibar",
    audience: "guest",
    title: { fa: "مینی‌بار", en: "Minibar", fr: "Minibar", ar: "الميني بار" },
    body: {
      fa: "هرچه از مینی‌بار برداشتید را در «اقامت من» بخش مینی‌بار انتخاب کنید؛ به صورتحساب اتاق اضافه می‌شود.",
      en: "Select what you took from the minibar in “My stay”, minibar section; it goes on your room bill.",
      fr: "Indiquez ce que vous avez pris dans le minibar depuis « Mon séjour », rubrique Minibar ; c'est ajouté à la note.",
      ar: "اختر ما أخذته من الميني بار في «إقامتي» قسم الميني بار؛ يضاف إلى فاتورة الغرفة.",
    },
    keywords: "مینی بار,مینیبار,یخچال,نوشیدنی اتاق,minibar,mini bar,fridge,frigo,ميني بار,ثلاجة",
    href: "/table/stay#minibar",
  },
];
