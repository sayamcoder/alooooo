import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import flash from "connect-flash";
import jwt from "jsonwebtoken";
import slugify from "slugify";
import { Database } from "bun:sqlite";

const app = express();
const PORT = 3000;
const JWT_SECRET = "super_secure_auth_key_nexoracloud_2026";

// Setup SQLite Database & Tables
const db = new Database("database.sqlite");

// Enable foreign key support in SQLite
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    slug TEXT UNIQUE,
    description TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_slug TEXT,
    name TEXT,
    price TEXT,
    features TEXT,
    FOREIGN KEY(category_slug) REFERENCES categories(slug) ON DELETE CASCADE ON UPDATE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// --- DATABASE AUTO-SEEDING SCRIPT ---
async function seedDatabase() {
  // 1. Seed Admin User
  const adminEmail = "Admin@nexoracloud.com";
  const adminPass = "admin@1234@1234";
  
  const adminExists = db.query("SELECT * FROM users WHERE LOWER(username) = ?").get(adminEmail.toLowerCase());
  if (!adminExists) {
    const hashedPass = await Bun.password.hash(adminPass);
    db.query("INSERT INTO users (username, password) VALUES (?, ?)").run(adminEmail, hashedPass);
    console.log("✅ Admin account seeded securely.");
  }

  // 2. Seed Default Settings (Global Redirect Link)
  const redirectSetting = db.query("SELECT * FROM settings WHERE key = 'buy_redirect_link'").get();
  if (!redirectSetting) {
    db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run("buy_redirect_link", "https://discord.gg/7bCXccejH9");
    console.log("✅ Default redirect link seeded.");
  }

  // 3. Seed Default Categories
  const categoriesCount = db.query("SELECT COUNT(*) as count FROM categories").get() as { count: number };
  if (categoriesCount.count === 0) {
    db.query("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)")
      .run("Basic Plans", "basic", "NEXORACLOUD PREMIUM GAME PLANS");
    db.query("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)")
      .run("Standard Plans", "standard", "NEXORACLOUD EXTREME GAME SERVER");
    db.query("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)")
      .run("Premium Plans", "premium", "NEXORACLOUD RYZEN 5 PLANS");
    console.log("🌱 Seeded initial game categories.");
  }

  // 4. Seed default 18 Plans if empty
  const plansCount = db.query("SELECT COUNT(*) as count FROM plans").get() as { count: number };
  if (plansCount.count === 0) {
    const defaultBasicFeatures = "RAM 2GB DDR5\nCPU 100% High Frequency\nStorage 10GB NVMe\n1 Additional Port\n1 Database Space\n2 Backup Limit\n1 Server Splitter\nPremium Game Panel";
    const defaultStandardFeatures = "RAM 2GB DDR5\nCPU 100% Ultra High Freq\nStorage 20GB NVMe\n1 Additional Port\n1 Database Space\n2 Backup Limit\n1 Server Splitter\nPremium Game Panel";
    const defaultPremiumFeatures = "RAM 2GB DDR5\nCPU 100% High Frequency\nStorage 20GB NVMe\n1 Additional Port\n1 Database Space\n2 Backup Limit\n1 Server Splitter\nPremium Game Panel";

    const defaultPlans = [
      { tier: "basic", name: "2GB PLAN", price: "₹40", features: defaultBasicFeatures },
      { tier: "basic", name: "4GB PLAN", price: "₹80", features: defaultBasicFeatures.replace("2GB", "4GB").replace("10GB", "20GB").replace("2 Backup", "4 Backup") },
      { tier: "basic", name: "8GB PLAN", price: "₹160", features: defaultBasicFeatures.replace("2GB", "8GB").replace("10GB", "40GB").replace("2 Backup", "6 Backup").replace("1 Database", "2 Database") },
      { tier: "basic", name: "16GB PLAN", price: "₹320", features: defaultBasicFeatures.replace("2GB", "16GB").replace("10GB", "80GB").replace("2 Backup", "8 Backup").replace("1 Database", "3 Database") },
      { tier: "basic", name: "24GB PLAN", price: "₹480", features: defaultBasicFeatures.replace("2GB", "24GB").replace("10GB", "120GB").replace("2 Backup", "10 Backup").replace("1 Database", "4 Database") },
      { tier: "basic", name: "32GB PLAN", price: "₹640", features: defaultBasicFeatures.replace("2GB", "32GB").replace("10GB", "160GB").replace("2 Backup", "12 Backup").replace("1 Database", "5 Database") },
      
      { tier: "standard", name: "2GB PLAN", price: "₹160", features: defaultStandardFeatures },
      { tier: "standard", name: "4GB PLAN", price: "₹320", features: defaultStandardFeatures.replace("2GB", "4GB").replace("20GB", "40GB").replace("2 Backup", "4 Backup") },
      { tier: "standard", name: "8GB PLAN", price: "₹640", features: defaultStandardFeatures.replace("2GB", "8GB").replace("20GB", "80GB").replace("2 Backup", "6 Backup").replace("1 Database", "2 Database") },
      { tier: "standard", name: "16GB PLAN", price: "₹1280", features: defaultStandardFeatures.replace("2GB", "16GB").replace("20GB", "160GB").replace("2 Backup", "8 Backup").replace("1 Database", "3 Database") },
      { tier: "standard", name: "24GB PLAN", price: "₹1920", features: defaultStandardFeatures.replace("2GB", "24GB").replace("20GB", "240GB").replace("2 Backup", "10 Backup").replace("1 Database", "4 Database") },
      { tier: "standard", name: "32GB PLAN", price: "₹2560", features: defaultStandardFeatures.replace("2GB", "32GB").replace("20GB", "320GB").replace("2 Backup", "12 Backup").replace("1 Database", "5 Database") },
      
      { tier: "premium", name: "2GB PLAN", price: "₹100", features: defaultPremiumFeatures },
      { tier: "premium", name: "4GB PLAN", price: "₹200", features: defaultPremiumFeatures.replace("2GB", "4GB").replace("20GB", "40GB").replace("2 Backup", "4 Backup") },
      { tier: "premium", name: "8GB PLAN", price: "₹400", features: defaultPremiumFeatures.replace("2GB", "8GB").replace("20GB", "80GB").replace("2 Backup", "6 Backup").replace("1 Database", "2 Database") },
      { tier: "premium", name: "16GB PLAN", price: "₹800", features: defaultPremiumFeatures.replace("2GB", "16GB").replace("20GB", "160GB").replace("2 Backup", "8 Backup").replace("1 Database", "3 Database") },
      { tier: "premium", name: "24GB PLAN", price: "₹1200", features: defaultPremiumFeatures.replace("2GB", "24GB").replace("20GB", "240GB").replace("2 Backup", "10 Backup").replace("1 Database", "4 Database") },
      { tier: "premium", name: "32GB PLAN", price: "₹1600", features: defaultPremiumFeatures.replace("2GB", "32GB").replace("20GB", "320GB").replace("2 Backup", "12 Backup").replace("1 Database", "5 Database") }
    ];

    const stmt = db.prepare("INSERT INTO plans (category_slug, name, price, features) VALUES (?, ?, ?, ?)");
    for (const plan of defaultPlans) {
      stmt.run(plan.tier, plan.name, plan.price, plan.features);
    }
    console.log("🌱 Default plans seeded.");
  }
}
seedDatabase();

// Express Settings
app.set("view engine", "ejs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({ secret: "session_secret_key", resave: false, saveUninitialized: false }));
app.use(flash());

// Global Access Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.success_msg = req.flash("success");
  res.locals.error_msg = req.flash("error");

  // Load the dynamic buy/checkout redirect link globally
  const redirectSetting = db.query("SELECT value FROM settings WHERE key = 'buy_redirect_link'").get() as { value: string } | undefined;
  res.locals.buyRedirectLink = redirectSetting ? redirectSetting.value : "https://discord.gg/7bCXccejH9";

  const token = req.cookies.token;
  if (token) {
    try {
      res.locals.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

// Admin Route Protection Guard
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!res.locals.user || res.locals.user.username.toLowerCase() !== "admin@nexoracloud.com") {
    req.flash("error", "Access denied. Admin portal protected.");
    return res.redirect("/login");
  }
  next();
};

// --- CORE FRONTEND ROUTES ---

// Landing Page (Dynamically loads categories, plans & banner announcements)
app.get("/", (req: Request, res: Response) => {
  const categories = db.query("SELECT * FROM categories").all();
  const plans = db.query("SELECT * FROM plans").all();
  const announcements = db.query("SELECT * FROM announcements ORDER BY created_at DESC").all();
  res.render("index", { categories, plans, announcements });
});

// Auth Routes
app.get("/login", (req: Request, res: Response) => {
  if (res.locals.user) return res.redirect("/");
  res.render("login");
});

app.get("/register", (req: Request, res: Response) => {
  if (res.locals.user) return res.redirect("/");
  res.render("register");
});

app.post("/register", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await Bun.password.hash(password);
    db.query("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
    req.flash("success", "Registration successful! You can now log in.");
    res.redirect("/login");
  } catch (error) {
    req.flash("error", "Username already exists.");
    res.redirect("/register");
  }
});

app.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = db.query("SELECT * FROM users WHERE LOWER(username) = ?").get(username.toLowerCase()) as any;

  if (!user) {
    req.flash("error", "Invalid credentials.");
    return res.redirect("/login");
  }

  const isMatch = await Bun.password.verify(password, user.password);
  if (!isMatch) {
    req.flash("error", "Invalid credentials.");
    return res.redirect("/login");
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
  res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
  
  if (user.username.toLowerCase() === "admin@nexoracloud.com") {
    res.redirect("/admin/dashboard");
  } else {
    res.redirect("/");
  }
});

app.get("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  req.flash("success", "Logged out successfully.");
  res.redirect("/");
});

// --- DYNAMIC ADMIN ROUTES (SEPARATED VIEWS) ---

// 1. Admin: Dashboard & Announcements
app.get("/admin/dashboard", requireAdmin, (req: Request, res: Response) => {
  const announcements = db.query("SELECT * FROM announcements ORDER BY created_at DESC").all();
  
  const totalUsers = (db.query("SELECT COUNT(*) as count FROM users").get() as any).count;
  const totalPlans = (db.query("SELECT COUNT(*) as count FROM plans").get() as any).count;
  const totalCategories = (db.query("SELECT COUNT(*) as count FROM categories").get() as any).count;

  res.render("admin-dashboard", { announcements, stats: { totalUsers, totalPlans, totalCategories } });
});

app.post("/admin/announcements", requireAdmin, (req: Request, res: Response) => {
  const { content } = req.body;
  if (content && content.trim()) {
    db.query("INSERT INTO announcements (content) VALUES (?)").run(content);
    req.flash("success", "Global banner announcement posted.");
  }
  res.redirect("/admin/dashboard");
});

app.post("/admin/announcements/delete/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  db.query("DELETE FROM announcements WHERE id = ?").run(id);
  req.flash("success", "Announcement removed.");
  res.redirect("/admin/dashboard");
});

// 2. Admin: Category Management
app.get("/admin/categories", requireAdmin, (req: Request, res: Response) => {
  const categories = db.query("SELECT * FROM categories").all();
  res.render("admin-categories", { categories });
});

app.post("/admin/categories", requireAdmin, (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (name) {
    const slug = slugify(name, { lower: true, strict: true });
    try {
      db.query("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)")
        .run(name, slug, description || "");
      req.flash("success", `Category "${name}" created successfully.`);
    } catch (e) {
      req.flash("error", "Category name or slug already exists.");
    }
  }
  res.redirect("/admin/categories");
});

app.post("/admin/categories/delete/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  db.query("DELETE FROM categories WHERE id = ?").run(id);
  req.flash("success", "Category deleted successfully.");
  res.redirect("/admin/categories");
});

// 3. Admin: Plan Management
app.get("/admin/plans", requireAdmin, (req: Request, res: Response) => {
  const plans = db.query("SELECT * FROM plans").all();
  const categories = db.query("SELECT * FROM categories").all() as any[];
  res.render("admin-plans", { plans, categories });
});

app.post("/admin/plans", requireAdmin, (req: Request, res: Response) => {
  const { category_slug, name, price, features } = req.body;
  if (category_slug && name && price && features) {
    db.query("INSERT INTO plans (category_slug, name, price, features) VALUES (?, ?, ?, ?)")
      .run(category_slug, name, price, features);
    req.flash("success", `Game Plan "${name}" created.`);
  }
  res.redirect("/admin/plans");
});

app.post("/admin/plans/delete/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  db.query("DELETE FROM plans WHERE id = ?").run(id);
  req.flash("success", "Plan removed.");
  res.redirect("/admin/plans");
});

// 4. Admin: Redirect Settings
app.get("/admin/settings", requireAdmin, (req: Request, res: Response) => {
  res.render("admin-settings");
});

app.post("/admin/settings/redirect", requireAdmin, (req: Request, res: Response) => {
  const { buy_redirect_link } = req.body;
  if (buy_redirect_link) {
    db.query("UPDATE settings SET value = ? WHERE key = 'buy_redirect_link'").run(buy_redirect_link);
    req.flash("success", "Global checkout redirect link updated!");
  }
  res.redirect("/admin/settings");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});