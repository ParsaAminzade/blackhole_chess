// بیست شخصیتِ ربات. هر کدام سبک، ترفندها و سطحِ خودش را دارد.
//
// depth/time  عمق و زمانِ فکر کردن
// noise       مقدارِ تصادفی‌بودنِ انتخاب (صدمِ سرباز)
// blunder     احتمالِ یک حرکتِ کاملاً تصادفی
// maxDrop     حداکثر ضرری که به‌خاطرِ سبکش قبول می‌کند (صدمِ سرباز)
// w           وزن‌های ارزیابیِ موقعیت (سلیقه‌ی شخصیت)
// r           امتیازِ اضافه برای نوعِ حرکت (عادت‌های شخصیت)
// vals        ارزشِ شخصیِ مهره‌ها
// system      چیدمانِ دلخواه در شروع، برای سفید و سیاه
// lines       خط‌های شروع و تله‌هایی که حفظ است

const FRIED_LIVER = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7", "Kxf7", "Qf3+"];

export const BOTS = [
  {
    id: "meteor", name: "شهاب", title: "تازه‌کار عجول", level: 1, kind: "comet", hue: [18, 350],
    desc: "سریع و بدون نقشه بازی می‌کند و هر مهره‌ای را که بتواند می‌زند.",
    tricks: ["هر مهره‌ای را می‌زند", "زیاد اشتباه می‌کند"],
    depth: 1, time: 300, noise: 120, blunder: 0.3, maxDrop: 400,
    r: { capture: 120, forward: 8 },
  },
  {
    id: "moon", name: "قمر", title: "مقلد", level: 1, kind: "planet", hue: [220, 240],
    desc: "هر حرکتی بکنید، همان را قرینه تکرار می‌کند تا جایی که بشود.",
    tricks: ["تقلید حرکت شما", "بازی قرینه"],
    depth: 1, time: 300, noise: 60, blunder: 0.12, maxDrop: 500,
    r: { mirror: 600 },
  },
  {
    id: "comet", name: "دنباله‌دار", title: "عاشق وزیر", level: 2, kind: "comet", hue: [190, 210],
    desc: "وزیر را خیلی زود بیرون می‌آورد و دنبال مات سریع است.",
    tricks: ["مات چهارحرکته", "حمله‌ی زود با وزیر"],
    depth: 2, time: 500, noise: 50, blunder: 0.1, maxDrop: 200,
    r: { queen: 45, earlyQueen: 70, check: 40 },
    system: { w: ["e4", "Qh5", "Bc4"], b: ["e5", "Qh4", "Bc5"] },
    lines: [
      ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"],
      ["e4", "e5", "Qh5", "Nc6", "Bc4", "g6", "Qf3", "Nf6", "Qb3"],
      ["e4", "e5", "Nf3", "Qf6"],
    ],
  },
  {
    id: "dust", name: "غبار", title: "سربازباز", level: 2, kind: "planet", hue: [35, 20],
    desc: "بیشتر با سربازها بازی می‌کند و آن‌ها را تا جای ممکن جلو می‌برد.",
    tricks: ["پیشروی سربازها", "گرفتن فضا"],
    depth: 2, time: 500, noise: 40, blunder: 0.08, maxDrop: 160,
    w: { advance: 10, storm: 4 }, r: { pawn: 55, edge: 15 },
  },
  {
    id: "asteroid", name: "سیارک", title: "کیش‌دوست", level: 3, kind: "planet", hue: [0, 15],
    desc: "هر جا بتواند کیش می‌دهد، حتی اگر فایده‌ای نداشته باشد.",
    tricks: ["کیش پشت کیش", "نزدیک‌شدن به شاه"],
    depth: 2, time: 600, noise: 35, blunder: 0.06, maxDrop: 220,
    w: { aggr: 3 }, r: { check: 160, near: 25 },
  },
  {
    id: "saturn", name: "زحل", title: "دیوار", level: 3, kind: "ring", hue: [45, 30],
    desc: "عقب می‌نشیند، محکم می‌چیند و منتظر اشتباه شما می‌ماند.",
    tricks: ["قلعه‌ی زود", "چیدمان بسته (هیپو)", "صبر"],
    depth: 2, time: 700, noise: 20, blunder: 0.04, maxDrop: 80,
    w: { safety: 14, keep: 2, advance: -3 }, r: { castle: 120, retreat: 10, forward: -6 },
    system: {
      w: ["g3", "Bg2", "e3", "Ne2", "d3", "O-O", "Nd2", "b3", "Bb2"],
      b: ["g6", "Bg7", "e6", "Ne7", "d6", "O-O", "Nd7", "b6", "Bb7"],
    },
  },
  {
    id: "mars", name: "مریخ", title: "مهاجم بی‌پروا", level: 4, kind: "planet", hue: [8, 355],
    desc: "از حرکت اول حمله می‌کند و برای باز کردن راه شاه سرباز می‌دهد.",
    tricks: ["گامبی شاه", "گامبی لتونی", "حمله‌ی مستقیم به شاه"],
    depth: 2, time: 800, noise: 30, blunder: 0.04, maxDrop: 180,
    w: { aggr: 7, storm: 5 }, r: { check: 50, capture: 25, forward: 8, near: 30 },
    system: { w: ["e4", "f4", "Nf3", "Bc4"], b: ["e5", "f5", "Nf6"] },
    lines: [
      ["e4", "e5", "f4", "exf4", "Nf3", "g5", "h4"],
      ["e4", "e5", "f4", "Bc5", "Nf3"],
      ["e4", "e5", "Nf3", "f5"],
      ["e4", "c5", "b4"],
    ],
  },
  {
    id: "mercury", name: "عطارد", title: "تله‌گذار", level: 4, kind: "planet", hue: [270, 290],
    desc: "شروع بازی را پر از تله می‌کند؛ یک حرکت بی‌دقت و کار تمام است.",
    tricks: ["تله‌ی لگال", "تله‌ی انگلوند", "تله‌ی بلکبرن", "تله‌ی فیل"],
    depth: 2, time: 900, noise: 20, blunder: 0.03, maxDrop: 120,
    r: { fork: 60 },
    lines: [
      ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
      FRIED_LIVER,
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
      ["d4", "e5", "dxe5", "Nc6", "Nf3", "Qe7", "Bf4", "Qb4+", "Bd2", "Qxb2", "Bc3", "Bb4", "Qd2", "Bxc3", "Qxc3", "Qc1#"],
      ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Nbd7", "cxd5", "exd5", "Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2", "Kxd8"],
    ],
  },
  {
    id: "pulsar", name: "پالسار", title: "اسب‌سوار", level: 5, kind: "star", hue: [150, 170],
    desc: "اسب‌هایش را از همه‌چیز بیشتر دوست دارد و دنبال چنگال است.",
    tricks: ["چنگال اسب", "گامبی هالووین", "اسب را عوض نمی‌کند"],
    depth: 2, time: 1000, noise: 20, blunder: 0.02, maxDrop: 110,
    vals: { n: 390 }, w: { center: 4 }, r: { knight: 28, fork: 140 },
    system: { w: ["Nf3", "Nc3", "e4", "d4"], b: ["Nf6", "Nc6", "e5", "d5"] },
    lines: [["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6", "Nxe5"]],
  },
  {
    id: "venus", name: "زهره", title: "فیل‌باز", level: 5, kind: "planet", hue: [50, 35],
    desc: "فیل‌ها را روی قطرهای بلند می‌نشاند و جفت‌فیل را نگه می‌دارد.",
    tricks: ["فیانکتوی دوطرفه", "جفت‌فیل", "قطرهای بلند"],
    depth: 2, time: 1000, noise: 20, blunder: 0.02, maxDrop: 90,
    vals: { b: 390 }, w: { pair: 50 }, r: { bishop: 18 },
    system: {
      w: ["g3", "Bg2", "b3", "Bb2", "Nf3", "O-O", "c4"],
      b: ["g6", "Bg7", "b6", "Bb7", "Nf6", "O-O", "c5"],
    },
  },
  {
    id: "jupiter", name: "مشتری", title: "صاحب مرکز", level: 5, kind: "ring", hue: [28, 12],
    desc: "مرکز صفحه را با سرباز پر می‌کند و جای نفس‌کشیدن نمی‌گذارد.",
    tricks: ["مرکز پر از سرباز", "برتری فضا"],
    depth: 2, time: 1100, noise: 18, maxDrop: 90,
    w: { center: 16, advance: 3, dev: 6 },
    system: { w: ["e4", "d4", "c4", "f4", "Nc3", "Nf3"], b: ["e5", "d5", "c5", "Nc6", "Nf6"] },
  },
  {
    id: "neptune", name: "نپتون", title: "ساده‌کننده", level: 6, kind: "planet", hue: [205, 230],
    desc: "هر تعویضی را قبول می‌کند تا به آخربازی برسد و آن‌جا ببرد.",
    tricks: ["تعویض مهره‌ها", "آخربازی ساده", "شاه فعال"],
    depth: 3, time: 1200, noise: 15, maxDrop: 80,
    w: { keep: -9, simplify: 10, kingAct: 10 }, r: { trade: 70 },
    system: { w: ["d4", "Nf3", "e3", "Bd3", "O-O"], b: ["d5", "Nf6", "e6", "Be7", "O-O"] },
  },
  {
    id: "uranus", name: "اورانوس", title: "نامتعارف", level: 6, kind: "ring", hue: [175, 195],
    desc: "شروع‌های عجیب بازی می‌کند تا شما را از حفظیات بیرون بکشد.",
    tricks: ["شروع گروب", "شروع اورانگوتان", "پیش‌بینی‌ناپذیر"],
    depth: 3, time: 1200, noise: 55, maxDrop: 130,
    r: { edge: 35, king: 5 },
    system: { w: ["g4", "Bg2", "h3", "c4"], b: ["g5", "Bg7", "h6", "c5"] },
    lines: [["g4"], ["b4"], ["Nh3"], ["a4"], ["e4", "g5"], ["d4", "b5"], ["e4", "a6"], ["Nf3", "g5"]],
  },
  {
    id: "nebula", name: "سحابی", title: "طوفان سرباز", level: 6, kind: "star", hue: [300, 320],
    desc: "قلعه‌ی بزرگ می‌رود و سربازهای جناح شاه را به طرف شما می‌فرستد.",
    tricks: ["قلعه‌ی بزرگ", "طوفان سرباز h و g", "حمله‌ی جناحی"],
    depth: 3, time: 1300, noise: 18, maxDrop: 110,
    w: { storm: 14, aggr: 3, advance: 3 }, r: { edge: 22, castle: 20 },
    system: {
      w: ["d4", "Nc3", "Bf4", "Qd2", "O-O-O", "f3", "g4", "h4"],
      b: ["d6", "g6", "Bg7", "Nc6", "Be6", "Qd7", "O-O-O", "h5"],
    },
  },
  {
    id: "dwarf", name: "کوتوله‌ی سفید", title: "مدافع صبور", level: 7, kind: "star", hue: [210, 200],
    desc: "هیچ ضعفی نمی‌دهد، محکم می‌ماند و بعد از اشتباه شما ضدحمله می‌زند.",
    tricks: ["سیستم لندن", "دفاع کارو-کان", "ضدحمله"],
    depth: 3, time: 1400, noise: 10, maxDrop: 50,
    w: { safety: 16, dev: 5, keep: 1 }, r: { castle: 90 },
    system: {
      w: ["d4", "Bf4", "e3", "Nf3", "c3", "Bd3", "Nbd2", "O-O"],
      b: ["c6", "d5", "Bf5", "e6", "Nd7", "Ngf6", "Be7", "O-O"],
    },
  },
  {
    id: "supernova", name: "ابرنواختر", title: "قربانی‌دهنده", level: 7, kind: "star", hue: [40, 10],
    desc: "سرباز و مهره می‌دهد تا خط‌ها باز شود و حمله‌اش زودتر برسد.",
    tricks: ["گامبی دانمارکی", "گامبی ایوانز", "گامبی استافورد", "قربانی برای حمله"],
    depth: 3, time: 1400, noise: 25, maxDrop: 170,
    w: { aggr: 10, dev: 8, storm: 4 }, r: { check: 45, near: 30, capture: 10 },
    lines: [
      ["e4", "e5", "d4", "exd4", "c3", "dxc3", "Bc4", "cxb2", "Bxb2"],
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4", "Bxb4", "c3"],
      FRIED_LIVER,
      ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6", "Nxc6", "dxc6"],
      ["d4", "d5", "c4", "e5", "dxe5", "d4"],
    ],
  },
  {
    id: "magnetar", name: "مگنتار", title: "میخ‌کوب", level: 8, kind: "star", hue: [255, 280],
    desc: "مهره‌های شما را میخ می‌کند و فشار را آن‌قدر زیاد می‌کند تا چیزی بیفتد.",
    tricks: ["روی لوپز", "نیمزو-هندی", "میخ‌کردن اسب‌ها"],
    depth: 3, time: 1500, noise: 12, maxDrop: 70,
    w: { center: 5, dev: 6 }, r: { pin: 70, bishop: 8, rook: 6 },
    lines: [
      ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"],
      ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"],
      ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5", "Bg5"],
    ],
  },
  {
    id: "quasar", name: "کوازار", title: "شکارچی شاه", level: 8, kind: "star", hue: [330, 300],
    desc: "همه‌ی مهره‌هایش را به سمت شاه شما می‌چرخاند و رها نمی‌کند.",
    tricks: ["حمله‌ی یوگسلاو", "هندی شاه", "حمله‌ی مات"],
    depth: 3, time: 1700, noise: 12, maxDrop: 110,
    w: { aggr: 12, storm: 6 }, r: { check: 30, near: 40 },
    lines: [
      ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6", "Be3", "Bg7", "f3", "O-O", "Qd2"],
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4"],
      ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"],
    ],
  },
  {
    id: "neutron", name: "ستاره‌ی نوترونی", title: "فشارنده", level: 9, kind: "star", hue: [195, 215],
    desc: "آرام و بی‌عجله فضای شما را کم می‌کند و در آخربازی دقیق است.",
    tricks: ["فشار آرام", "سرباز آزاد", "آخربازی دقیق"],
    depth: 4, time: 2000, noise: 6, maxDrop: 40,
    w: { advance: 5, kingAct: 16, simplify: 8, safety: 6, center: 5 }, r: { trade: 15 },
    system: { w: ["d4", "c4", "Nc3", "Nf3", "e3"], b: ["d5", "e6", "Nf6", "Be7", "O-O", "c6"] },
  },
  {
    id: "singularity", name: "تکینگی", title: "سیاه‌چاله", level: 10, kind: "hole", hue: [30, 15],
    desc: "قوی‌ترین حریف: عمیق‌تر از بقیه حساب می‌کند و از هر اشتباه کوچک استفاده می‌کند.",
    tricks: ["بیشترین عمق محاسبه", "بدون ضعف", "شروع‌های اصلی"],
    depth: 4, time: 2800, noise: 0, maxDrop: 25,
    w: { center: 4, dev: 5, safety: 6, kingAct: 8 },
    lines: [
      ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1"],
      ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3"],
      ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3"],
      ["d4", "Nf6", "c4", "e6", "Nf3", "d5"],
    ],
  },
];

export const botById = (id) => BOTS.find((b) => b.id === id);
