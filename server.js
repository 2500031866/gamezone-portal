
require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");

console.log("MongoDB URI loaded:", !!process.env.MONGODB_URI);
console.log("Session secret loaded:", !!process.env.SESSION_SECRET);

// Check MongoDB URI without displaying credentials
try {
    const uri = new URL(process.env.MONGODB_URI);
    console.log("MongoDB hostname:", uri.hostname);
    console.log("MongoDB database:", uri.pathname);
} catch (error) {
    console.log("Invalid MongoDB URI format");
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

if (isProduction) app.set("trust proxy", 1);

// TEMPORARY: In-memory sessions for connection testing.
// Restore MongoDB session storage after the connection works.
app.use(session({
    name: "klu_gamezone_session",
    secret: process.env.SESSION_SECRET || "temporary-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// USER SCHEMA
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 20,
        match: /^[a-z0-9_]+$/
    },
    passwordHash: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    }
}, { timestamps: true });

// REGISTRATION SCHEMA
const registrationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254
    },
    address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    team: {
        type: String,
        trim: true,
        default: "",
        maxlength: 100
    },
    tournament: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150
    },
    registeredAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Registration = mongoose.model("Registration", registrationSchema);

// ASYNC ERROR HANDLER
function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

// LOGIN CHECK
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }
    next();
}

// ADMIN CHECK
const requireAdmin = asyncRoute(async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    const user = await User.findById(req.session.userId).select("role");

    if (!user || user.role !== "admin") {
        return res.status(403).json({
            message: "Admin access required."
        });
    }

    next();
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
    res.json({
        message: "KLU GameZone backend is running",
        database: mongoose.connection.readyState === 1
            ? "Connected"
            : "Disconnected"
    });
});

// SIGNUP
app.post("/api/signup", asyncRoute(async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = req.body.password;

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({
            message: "Username must be 3-20 characters using letters, numbers or underscores."
        });
    }

    if (typeof password !== "string" ||
        password.length < 8 ||
        password.length > 72) {
        return res.status(400).json({
            message: "Password must be 8-72 characters."
        });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const user = await User.create({
            username,
            passwordHash,
            role: "user"
        });

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({
                    message: "Could not start your session."
                });
            }

            req.session.userId = user._id.toString();
            req.session.username = user.username;
            req.session.role = user.role;

            res.status(201).json({
                message: "Account created successfully!",
                user: {
                    username: user.username,
                    role: user.role
                }
            });
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "That username is already taken."
            });
        }
        throw error;
    }
}));

// LOGIN
app.post("/api/login", asyncRoute(async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = req.body.password;

    if (!username || typeof password !== "string" ||
        password.length > 72) {
        return res.status(400).json({
            message: "Enter your username and password."
        });
    }

    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({
            message: "Invalid username or password."
        });
    }

    req.session.regenerate((error) => {
        if (error) {
            return res.status(500).json({
                message: "Could not start your session."
            });
        }

        req.session.userId = user._id.toString();
        req.session.username = user.username;
        req.session.role = user.role;

        res.json({
            message: "Login successful!",
            user: {
                username: user.username,
                role: user.role
            }
        });
    });
}));

// CURRENT USER
app.get("/api/me", asyncRoute(async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "You are not logged in."
        });
    }

    const user = await User.findById(req.session.userId)
        .select("username role");

    if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({
            message: "Account not found. Please log in again."
        });
    }

    res.json({
        user: {
            username: user.username,
            role: user.role
        }
    });
}));

// LOGOUT
app.post("/api/logout", (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie("klu_gamezone_session", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax"
        });

        res.json({
            message: "Logged out successfully."
        });
    });
});

// TOURNAMENT REGISTRATION
app.post("/api/registrations", requireLogin,
    asyncRoute(async (req, res) => {
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const address = String(req.body.address || "").trim();
        const team = String(req.body.team || "").trim();
        const tournament = String(req.body.tournament || "").trim();

        if (!name || !email || !address || !tournament) {
            return res.status(400).json({
                message: "Name, email, address and tournament are required."
            });
        }

        if (
            name.length > 100 ||
            email.length > 254 ||
            address.length > 500 ||
            team.length > 100 ||
            tournament.length > 150
        ) {
            return res.status(400).json({
                message: "One or more fields are too long."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                message: "Enter a valid email address."
            });
        }

        const registration = await Registration.create({
            userId: req.session.userId,
            name,
            email,
            address,
            team,
            tournament
        });

        res.status(201).json({
            message: "Tournament registration saved!",
            registrationId: registration._id
        });
    })
);

// ADMIN REGISTRATIONS
app.get("/api/admin/registrations", requireAdmin,
    asyncRoute(async (req, res) => {
        const registrations = await Registration.find()
            .sort({ registeredAt: -1 })
            .populate("userId", "username")
            .lean();

        res.json({
            registrations: registrations.map((item) => ({
                id: item._id,
                username: item.userId
                    ? item.userId.username
                    : "Unknown",
                name: item.name,
                email: item.email,
                address: item.address,
                team: item.team,
                tournament: item.tournament,
                registeredAt: item.registeredAt
            }))
        });
    })
);

// FRONTEND FILES
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

// ERROR HANDLER
app.use((error, req, res, next) => {
    console.error("Server error:", error.message);

    if (res.headersSent) return next(error);

    res.status(500).json({
        message: "A server error occurred. Check the terminal."
    });
});

// START SERVER
async function startServer() {
    if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
        throw new Error("Missing MONGODB_URI or SESSION_SECRET in .env");
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB!");

    // CREATE ADMIN ACCOUNT
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
        const username = process.env.ADMIN_USERNAME.trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (password.length < 12) {
            console.warn("Admin password must be at least 12 characters.");
        } else {
            let admin = await User.findOne({ username });

            if (!admin) {
                const passwordHash = await bcrypt.hash(password, 12);

                await User.create({
                    username,
                    passwordHash,
                    role: "admin"
                });

                console.log("Admin account created.");
            } else if (admin.role !== "admin") {
                admin.role = "admin";
                await admin.save();

                console.log("Configured account promoted to admin.");
            }
        }
    }

    app.listen(PORT, () => {
        console.log(`KLU GameZone running at http://localhost:${PORT}`);
    });
}

startServer().catch((error) => {
    console.error("Startup failed:", error.message);
    process.exit(1);
});
