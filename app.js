const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const User = require("./models/user");
const admin = require('./models/adminschema');
const authRoutes = require("./routes/authroute");
const path = require("path");
const { GoogleGenerativeAI } = require('@google/generative-ai');
const natural = require('natural');
const tfidf = new natural.TfIdf();
const csv = require('csv-parser');
const fuzz = require('fuzzball');
const cors = require('cors');

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Define CORS options first
const corsOptions = {
  origin: ['https://live-d365.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
};

// ✅ Apply CORS middleware correctly
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lived365.png'));
});

// Routes
app.use("/auth", authRoutes);

// Server start
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
