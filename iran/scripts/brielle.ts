/**
 * Brielle restaurant (Tehran) — real menu, used as the showcase demo.
 * Prices are those of the restaurant's own menu, in thousands of tomans (1319 → 1 319 000 tomans).
 * Photos: scripts/demo-assets/brielle/<photo>.jpg, logo.png.
 */
export type BrielleItem = {
  name: string;
  en: string;
  description?: string;
  price: number;
  photo?: string;
  featured?: boolean;
  tags?: string[];
};

export const BRIELLE_MENU: { key: string; name: string; items: BrielleItem[] }[] = [
  {
    key: "starters",
    name: "پیش‌غذا",
    items: [
      {
        name: "اسپرینگ رول سبزیجات",
        en: "Vegetables Spring Rolls",
        price: 780,
        photo: "springrolls",
        tags: ["vegetarian"],
      },
      {
        name: "راک شریمپ",
        en: "Rock Shrimp",
        description: "میگو، هویج، خیار، کاهو، سس مایونز ژاپنی",
        price: 1319,
        photo: "rockshrimp",
        featured: true,
      },
      {
        name: "فایر کراکر",
        en: "Fire Cracker",
        description: "سینه مرغ مزه‌دار شده با آرد، هویج، خیار، کاهو رسمی، سس مایونز ژاپنی",
        price: 1139,
        photo: "firecracker",
      },
      { name: "میرزا قاسمی", en: "Mirza Ghasemi", price: 639, photo: "mirza", tags: ["vegetarian"] },
      { name: "کشک بادمجان", en: "Kashke Bademjan", price: 619, photo: "kashk", tags: ["vegetarian"] },
      { name: "حمص", en: "Hummus", price: 779, tags: ["vegan"] },
      { name: "سیب زمینی سرخ کرده", en: "French Fries", price: 749, photo: "fries", tags: ["vegetarian"] },
    ],
  },
  {
    key: "salads",
    name: "سالاد",
    items: [
      {
        name: "سالاد مرغ دودی",
        en: "Smoked Chicken Salad",
        description: "کاهو رسمی، کینوا، فیله پرتقال، مویز، بروکلی، مرغ دودی، سس ماست و ارده، تخمه کدو",
        price: 1109,
        photo: "smokedsalad",
      },
      {
        name: "سالاد میگو",
        en: "Shrimp Salad",
        description: "میگو سوخاری، کاهو، سیب سبز، ریحان ایتالیایی، روکولا، فیله پرتقال، پنیر موزارلا",
        price: 1189,
        photo: "shrimpsalad",
      },
      {
        name: "سالاد استیک",
        en: "Grilled Steak Salad With Grilled Cheese",
        description:
          "۱۱۰ گرم فیله گوساله گریل‌شده، کاهو، پنیر کبابی، پنیر پارمسان، پرک بادام، سس انار و بالزامیک",
        price: 1319,
        photo: "steaksalad",
      },
      {
        name: "سالاد بیکن و آووکادو",
        en: "Bacon Avocado",
        description:
          "بیکن، آووکادو، فیله پرتقال، فیله توت‌فرنگی، سیب، گردو، پنیر فتا، بیبی اسفناج، کاهو رسمی، پنیر پارمسان",
        price: 1200,
        photo: "baconavocado",
        featured: true,
      },
      { name: "سالاد یونانی", en: "Greek Salad", price: 1190, photo: "greek", tags: ["vegetarian"] },
      { name: "سالاد آنتراکت", en: "Entrecote Salad", price: 1139, photo: "entrecote" },
      { name: "سالاد سبز", en: "Green Salad", price: 979, photo: "greensalad", tags: ["vegan"] },
      { name: "سالاد سزار", en: "Caesar Salad", price: 1129, photo: "caesar" },
    ],
  },
  {
    key: "burgers",
    name: "گریل و ساندویچ",
    items: [
      { name: "ساندویچ پولد بیف", en: "Pulled Beef Sandwich", price: 1319, photo: "pulledsandwich" },
      {
        name: "چیکن پستو",
        en: "Chicken Pesto Sandwich",
        description: "سینه مرغ گریل، پستو سبز، میکس رلیش، گوجه خشک، قارچ",
        price: 1139,
        photo: "pestosandwich",
      },
    ],
  },
  {
    key: "mains",
    name: "غذای اصلی",
    items: [
      {
        name: "بشقاب سالمون",
        en: "Salmon Plate",
        description: "فیله ماهی سالمون، پوره نخود فرنگی، پوره هویج، پوره سیب زمینی، سبزیجات",
        price: 2400,
        photo: "salmon",
        featured: true,
      },
      {
        name: "شنیسل مرغ",
        en: "Chicken Schnitzel",
        description: "مرغ سوخاری، سیمپل فرایز، سس سبز، سس مایونز ژاپنی، ساید سبزیجات",
        price: 1399,
        photo: "schnitzel",
      },
      {
        name: "چیکن کریسپی",
        en: "Crispy Chicken",
        description: "مرغ کریسپی، پوره سیب زمینی، ساید سبزیجات، سس قارچ",
        price: 1399,
        photo: "crispy",
      },
    ],
  },
  {
    key: "pizza",
    name: "پیتزا",
    items: [
      {
        name: "پیتزا سیسیلین",
        en: "Sicilian",
        description: "سینه بوقلمون دودی، سس سیر، پنیر موزارلا، سس پستو، پارمسان",
        price: 1289,
        photo: "sicilian",
      },
      {
        name: "پیتزا پپرونی",
        en: "Pepperoni",
        description: "پپرونی، فلفل هالوپینو، سس مارینارا، پنیر پارمسان، پول بیبر",
        price: 1299,
        photo: "pepperoni",
        featured: true,
        tags: ["spicy"],
      },
      {
        name: "پیتزا مارگاریتا",
        en: "Margherita",
        description: "پنیر پارمسان، ریحان ایتالیایی، سس مارینارا، پنیر موزارلا",
        price: 1059,
        photo: "margherita",
        tags: ["vegetarian"],
      },
      {
        name: "پیتزا ویتلو",
        en: "Vitello",
        description: "راسته گوساله، سس سیر به همراه مارینارا، قارچ، گوجه خشک",
        price: 1439,
        photo: "vitello",
      },
      {
        name: "پیتزا بیکن",
        en: "Bacon And Cream",
        description: "سس خامه، بیکن گوساله، ذرت، زیتون سیاه، پرک بادام",
        price: 1319,
        photo: "baconpizza",
      },
      {
        name: "پیتزا پولد بیف",
        en: "Pulled Beef Pizza",
        description: "سس خامه، قارچ، پولد بیف، پیاز کاراملی",
        price: 1339,
        photo: "pulledpizza",
      },
      {
        name: "پیتزا چیکن",
        en: "Chicken Pizza",
        description:
          "سینه مرغ، سس پستو ریحان، گوجه خشک، بادمجان کبابی، پنیر موزارلا، ریحان ایتالیایی، پنیر پارمسان",
        price: 1249,
        photo: "chickenpizza",
      },
      {
        name: "پیتزا بیف استراگانف",
        en: "Beef Stroganoff",
        description: "سس استراگانف، بیف، پنیر موتزارلا، فرایز",
        price: 1339,
        photo: "stroganoff",
      },
    ],
  },
  {
    key: "pasta",
    name: "پاستا",
    items: [
      { name: "فتوچینی پستو با گوشت", en: "Fettuccine Pesto With Beef", price: 1440, photo: "fettuccine" },
      { name: "پاستا چیکن آلفردو", en: "Chicken Alfredo Pasta", price: 1440, photo: "alfredo" },
      { name: "پاستا سبزیجات", en: "Vegetable Pasta", price: 1285, photo: "vegpasta", tags: ["vegetarian"] },
      { name: "اسپاگتی بلونز", en: "Spaghetti Bolognese", price: 1555, photo: "bolognese" },
    ],
  },
  {
    key: "soft_drinks",
    name: "نوشیدنی سرد",
    items: [
      {
        name: "موران",
        en: "Moran",
        description: "میکس بری، نوشیدنی گازدار، بلک بری، توت‌فرنگی و رزبری",
        price: 540,
        photo: "moran",
      },
      { name: "گرین", en: "Green", price: 480, photo: "green" },
    ],
  },
];
