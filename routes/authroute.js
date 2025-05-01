const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/user');
const PDFDocument = require("pdfkit");
const moment = require('moment');
const natural = require('natural');
const tfidf = new natural.TfIdf();
const csv = require('csv-parser');
const axios = require('axios');
const { createObjectCsvWriter } = require('csv-writer'); // Import CSV writer
const fuzzball = require('fuzzball');
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const { stringify } = require('csv-stringify/sync');




require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//store CV in uploads folder with name and date
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).send({ message: "Access denied. No token provided." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send({ message: "Invalid or expired token." });

        console.log("Authenticated User ID:", user.userId);  // Debug log
        req.user = user;
        next();
    });
};

//gmail id from where mail has been sent(for code varification using nodemialer SMTP method -gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

//code generation using crypto
function generate4DigitCode() {
    return crypto.randomInt(1000, 10000).toString();
}

//defined null initially then generated code stored in this
const verificationCodes = {};

// Function to normalize date
// Ensure moment.js is installed
function normalizeDate(dateString) {
    if (!dateString) return null; // Return null if no date is provided

    // Try parsing using different formats
    const formats = ["YYYY-MM-DD", "MMM YYYY", "MMMM YYYY", "DD/MM/YYYY", "MM/YYYY"];

    const parsedDate = moment(dateString, formats, true);

    return parsedDate.isValid() ? parsedDate.format("YYYY-MM-DD") : null; // Return formatted date or null if invalid
}


// **Move this function ABOVE the register route**   working properly
// async function getJsonFromGemini(text) {
//     try {
//         const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
//         const prompt = `
//             Extract the relevant information from the following resume text and return it as a structured JSON object.
//             The JSON should include: 
//             - personalInformation(firstName, lastName, email, contactNo, city, state, country)
//             - about(description, professionalTitle, primaryRole, microsoftDynamicsExpertise, microsoftDynamicsProduct, yearsOfExperience, linkedInURL)
//             - Qualification (array with UniversityName, Degree, Field_of_study, description)
//             - workExperience (array with companyName, jobTitle, designation, industryType, location, currentlyWorking, startDate, endDate, description)
//             - skills (array)
//             - projectExperience (array with projectName, jobTitle, description, technologiesUsed, startDate, endDate)
//             - MicrosoftCertificates(CertificateName,DateEarned,ValidityDate,certificateURL,description)

//             Resume text:
//             ${text}
//             `;

//         const response = await model.generateContent(prompt);
//         const result = response.response;
//         console.log(result);


//         if (!result || !result.text) {
//             throw new Error("Invalid response from Gemini API");
//         }

//         let jsonString = result.text();
//         jsonString = jsonString.replace(/```json|```/gi, '').trim(); // Remove code block markers if present

//         return JSON.parse(jsonString);
//     } catch (error) {
//         console.error("Error extracting JSON from Gemini:", error);
//         return null; // Return null in case of failure
//     }
//     // If JSON is broken, attempt to fix minor errors
//     const fixedJson = responseData.replace(/,(\s*[}\]])/g, '$1'); // Removes trailing commas
//     try {
//         return JSON.parse(fixedJson);
//     } catch (finalError) {
//         console.error("Failed to fix JSON:", finalError.message);
//         return null; // Handle gracefully instead of crashing
//     }
// }
async function getJsonFromGemini(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                // const model = await getWorkingGeminiClient();  // <- updated only this line

        const prompt = `
            Extract the relevant information from the following resume text and return it as a properly formatted JSON object.
            Ensure the JSON is syntactically correct without trailing commas or errors.
            Specifically look for a section titled 'Licenses & Certifications' or similar.
            From there, extract ONLY the certifications that are issued by Microsoft.
            Ignore all other certifications.
            Pay special attention to project experience sections which may be titled:
            - "Project Experience"
            - "Projects"
            - "Project Work"
            - Or may appear under company/job entries

            For each project, extract:
            1. Project name (look for patterns like "Project – [name]")
            2. Role in the project
            3. Detailed description (including responsibilities and achievements)
            4. Technologies used (especially Microsoft Dynamics modules)
            5. Dates/duration if available


            The extracted Microsoft certifications should be returned under a field named 'MicrosoftCertificates'.
            The JSON should include: 
            {
                "personalInformation": {
                    "firstName": "",
                    "lastName": "",
                    "email": "",
                    "contactNo": "",
                    "city": "",
                    "state": "",
                    "country": ""
                },
                "about": {
                    "description": "",
                    "professionalTitle": "",
                    "primaryRole": "",
                    "microsoftDynamicsExpertise": "",
                    "microsoftDynamicsProduct": "",
                    "yearsOfExperience": "",
                    "linkedInURL": ""
                },
                "Qualification": [
                    {
                        "UniversityName": "",
                        "Degree": "",
                        "Field_of_study": "",
                        "Start_month_year":"",
                        "End_month_year": "",
                        "description": ""
                    }
                ],
                "workExperience": [
                    {
                        "companyName": "",
                        "jobTitle": "",
                        "designation": "",
                        "industryType": "",
                        "location": "",
                        "currentlyWorking": false,
                        "startDate": "",
                        "endDate": "",
                        "description": ""
                    }
                ],
                "skills": [],
                "projectExperience": [
                    {
                        "projectName": "Extract the full project name",
                        "jobTitle": "Role in the project",
                        "description": "Detailed responsibilities and achievements. Combine all bullet points into a coherent paragraph.",
                        "technologiesUsed": ["List all relevant technologies/modules mentioned"],
                        "startDate": "If available",
                        "endDate": "If available"
                    }
                ],
               "MicrosoftCertificates": [
                    {
                        "CertificateName": "Extract the full certification name including code (e.g., MB-210)",
                        "DateEarned": "Leave blank if not available",
                        "ValidityDate": "Leave blank if not available",
                        "certificateURL": "Leave blank if not available in the document",
                        "description": "Mention the issuing authority (e.g., Microsoft) and any unique certification code seen (e.g., H743-6952)"
                    }
]

            }

            Resume text:
            ${text}
        `;

        const response = await model.generateContent(prompt);
        const result = response.response;

        if (!result || !result.text) {
            throw new Error("Invalid response from Gemini API");
        }

        let jsonString = result.text();
        jsonString = jsonString.replace(/```json|```/gi, '').trim(); // Remove markdown code block markers

        // Try parsing JSON safely
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.warn("Initial JSON parse failed, attempting to fix formatting...");

            // Auto-fix common JSON formatting issues
            let fixedJsonString = jsonString
                .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas
                .replace(/(\r\n|\n|\r)/gm, ''); // Remove newlines

            try {
                return JSON.parse(fixedJsonString);
            } catch (finalError) {
                console.error("Failed to fix JSON:", finalError.message);
                return null; // Gracefully return null
            }
        }
    } catch (error) {
        console.error("Error extracting JSON from Gemini:", error);
        return null; // Return null in case of failure
    }
}



//helper function to convert data into text
const generateExtractText = (user) => {
    const extractText = `
            Personal Information:
            Name: ${user.personalInformation.firstName} ${user.personalInformation.lastName}
            Email: ${user.personalInformation.email}
            Contact: ${user.personalInformation.contactNo}
            City: ${user.personalInformation.city}
            State: ${user.personalInformation.state}
            Country: ${user.personalInformation.country}

            About:
            Description: ${user.about.description}
            LinkedIn: ${user.about.linkedInURL}
            Professional Title: ${user.about.professionalTitle}
            Primary Role: ${user.about.primaryRole}
            Microsoft Dynamics Expertise: ${user.about.microsoftDynamicsExpertise}
            Microsoft Dynamics Product: ${user.about.microsoftDynamicsProduct}
            Years of Experience: ${user.about.yearsOfExperience}

            Skills:
            ${user.skills.join(", ")}

            Work Experience:
            ${user.workExperience.map(work => `
                Company: ${work.companyName}
                Job Title: ${work.jobTitle}
                Designation: ${work.designation}
                Industry: ${work.industryType}
                Location: ${work.location}
                Currently Working: ${work.currentlyWorking}
                Start Date: ${work.startDate.month} ${work.startDate.year}
                End Date: ${work.currentlyWorking ? "Present" : `${work.endDate.month} ${work.endDate.year}`}
                Description: ${work.description}
            `).join("\n")}

            Qualifications:
            ${user.Qualification.map(edu => `
                University: ${edu.UniversityName}
                Degree: ${edu.Degree}
                Field of Study: ${edu.Field_of_study}
                Start Date: ${edu.Start_month_year}
                End Date: ${edu.End_month_year}
                Description: ${edu.description}
            `).join("\n")}

            Certifications:
            ${user.MicrosoftCertificates.map(cert => `
                Certificate: ${cert.CertificateName}
                Date Earned: ${cert.DateEarned}
                Validity: ${cert.ValidityDate}
                URL: ${cert.certificateURL}
                Description: ${cert.description}
            `).join("\n")}

            Projects:
            ${user.projectExperience.map(proj => `
                Project: ${proj.projectName}
                Job Title: ${proj.jobTitle}
                Description: ${proj.description}
                Technologies: ${Array.isArray(proj.technologiesUsed) ? proj.technologiesUsed.join(", ") : ""}

                Start Date: ${proj.startDate}
                End Date: ${proj.endDate}
            `).join("\n")}
        `;

    return extractText.trim(); // Remove leading/trailing whitespace
};

// Store temporary user data and verification codes
const temporaryUserData = {};

router.post('/register', upload.single('file'), async (req, res) => {
    try {
        const { firstName, lastName, email, password, contactNo, role } = req.body;

        if (!email || !password || !contactNo) {
            return res.status(400).json({ error: "Email, Password, and ContactNo are required" });
        }

        const passwordCheck = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordCheck.test(password)) {
            return res.status(400).json({
                error: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character."
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'Email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Determine adminId: If the requester is an admin, store their ID, otherwise null
        const adminId = req.user?.role === "admin" ? req.user._id : null;

        let personalInformation = {};
        let about = {};
        let skills = [];
        let projectExperience = [];
        let Qualification = [];
        let workExperience = [];
        let extractText = "";

        if (req.file) {
            const { path: filePath, originalname: filename } = req.file;
            const ext = path.extname(filename).toLowerCase();

            let text = "";
            if (ext === '.docx') {
                const result = await mammoth.extractRawText({ path: filePath });
                text = result.value;
            } else if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const result = await pdfParse(dataBuffer);
                text = result.text;
            } else {
                return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
            }

            const extractedData = await getJsonFromGemini(text);

            if (!extractedData) {
                return res.status(500).json({ error: "Failed to extract data from CV" });
            }

            personalInformation = extractedData.personalInformation || personalInformation;
            about = extractedData.about || {};
            skills = extractedData.skills || [];
            projectExperience = extractedData.projectExperience || [];
            Qualification = extractedData.Qualification || [];
            workExperience = extractedData.workExperience || [];

            workExperience.forEach(work => {
                if (work.startDate) work.startDate = normalizeDate(work.startDate);
                if (work.endDate) work.endDate = normalizeDate(work.endDate);
            });

            Qualification.forEach(edu => {
                if (edu.Start_month_year) edu.Start_month_year = normalizeDate(edu.Start_month_year);
                if (edu.End_month_year) edu.End_month_year = normalizeDate(edu.End_month_year);
            });

            projectExperience.forEach(proj => {
                if (proj.startDate) proj.startDate = normalizeDate(proj.startDate);
                if (proj.endDate) proj.endDate = normalizeDate(proj.endDate);
            });

            extractText += `${personalInformation.firstName || ""} ${personalInformation.lastName || ""}\n`;
            extractText += `${personalInformation.email || ""} | ${personalInformation.contactNo || ""}\n`;
            extractText += `${about.linkedInURL || ""}\n\n`;

            extractText += `Professional Summary:\n${about.description || ""}\n\n`;
            extractText += `Skills: ${skills.join(", ")}\n\n`;

            if (workExperience.length) {
                extractText += "Work Experience:\n";
                workExperience.forEach(work => {
                    let start = work.startDate || "Unknown Start Date";
                    let end = work.currentlyWorking ? "Present" : work.endDate || "Unknown End Date";
                    extractText += `${work.jobTitle} at ${work.companyName} (${start} - ${end})\n`;
                    extractText += `${work.description || ""}\n\n`;
                });
            }

            if (Qualification.length) {
                extractText += "Education:\n";
                Qualification.forEach((edu, index) => {
                    extractText += `${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})\n\n`;
                });
            }

            if (projectExperience.length) {
                extractText += "Projects:\n";
                projectExperience.forEach(proj => {
                    extractText += `${proj.projectName} (${proj.startDate} - ${proj.endDate})\n`;
                    extractText += `Tech Used: ${proj.technologiesUsed.join(", ")}\n`;
                    extractText += `${proj.description}\n\n`;
                });
            }
        }

        // Store user data temporarily
        temporaryUserData[email] = {
            firstName,
            lastName,
            email,
            password: hashedPassword,
            contactNo,
            role: role || "user",
            adminId: null,
            file: req.file ? req.file.path : null,
            personalInformation,
            about,
            skills,
            projectExperience,
            Qualification,
            workExperience,
            extractText: extractText.trim(),
            token: null
        };

        // Generate and send verification code
        const code = generate4DigitCode();
        verificationCodes[email] = code;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Verification Code",
            text: `Your 4-digit verification code is: ${code}`
        });

        res.status(201).json({
            message: "Verification code sent to email. Please verify your email to complete registration.",
            email
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || "Internal Server Error" });
    }
});

router.post('/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }

        if (!verificationCodes[email] || verificationCodes[email] !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Get temporary user data
        const userData = temporaryUserData[email];
        if (!userData) {
            return res.status(400).json({ error: 'Registration data not found. Please register again.' });
        }

        // Create new user in database
        const newUser = new User(userData);
        const savedUser = await newUser.save();

        // If the user is an admin, update their adminId field with their ObjectId
        if (userData.role === "admin") {
            await User.findByIdAndUpdate(savedUser._id, { adminId: savedUser._id });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: savedUser._id, role: savedUser.role }, process.env.JWT_SECRET);

        // Store the token in the database
        await User.findByIdAndUpdate(savedUser._id, { token });

        // Clean up temporary data
        delete temporaryUserData[email];
        delete verificationCodes[email];

        // Return success response with token and user data
        res.status(200).json({
            message: "Verification successful",
            token,
            user: {
                _id: savedUser._id,
                email: savedUser.email,
                firstName: savedUser.firstName,
                lastName: savedUser.lastName,
                role: savedUser.role
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || "Internal Server Error" });
    }
});

//login based on email & password
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid password" });
        }

        // Generate a new token with both userId and role
        const token = jwt.sign(
            { 
                userId: user._id.toString(), // Ensure userId is a string
                role: user.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Update user's token in database
        await User.findByIdAndUpdate(user._id, { token });

        // Send response with user data and token
        res.status(200).json({
            message: "Login successful",
            user: {
                _id: user._id.toString(), // Ensure _id is a string
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                token: token // Include token in user object
            }
        });

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: e.message || "Internal Server Error" });
    }
});


// Middleware to Check if User is Admin
// const isAdmin = async (req, res, next) => {
//     try {
//         const authHeader = req.headers.authorization;
//         if (!authHeader || !authHeader.startsWith("Bearer ")) {
//             return res.status(401).json({ error: "Unauthorized access. No token provided." });
//         }

//         const token = authHeader.split(" ")[1];
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         const admin = await User.findById(decoded.userId);

//         if (!admin) {
//             return res.status(404).json({ error: "User not found." });
//         }

//         if (admin.role !== "admin") {
//             return res.status(403).json({ error: "Access denied. Admins only." });
//         }

//         req.admin = admin; // Attach admin info to request
//         next();

//     } catch (err) {
//         console.error("Admin Auth Error:", err);
//         return res.status(401).json({ error: "Invalid or expired token." });
//     }
// };

const isAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log("Received Authorization Header:", authHeader); // Debugging

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Unauthorized access. No token provided." });
        }

        const token = authHeader.split(" ")[1];
        console.log("Extracted Token:", token); // Debugging

        if (!token || token === "undefined" || token === "null") {
            return res.status(401).json({ error: "Invalid token provided." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded Token:", decoded); // Debugging

        const admin = await User.findById(decoded.userId);
        if (!admin) {
            return res.status(404).json({ error: "User not found." });
        }

        if (admin.role !== "admin") {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

        req.admin = admin;
        next();
    } catch (err) {
        console.error("Admin Auth Error:", err);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
};


// Function to download CVs from URL (CSV file case)
const downloadFile = async (fileUrl, modId) => {
    const fileName = `CV_${modId}${path.extname(fileUrl)}`;
    const uploadDir = path.join(__dirname, '../uploads'); // Ensure the 'uploads' folder exists

    const filePath = path.join(uploadDir, fileName);

    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath)); // Return the saved file path
        writer.on('error', reject);
    });
};

const extractTextFromCV = async (filePath) => {
    
    try {
        const ext = path.extname(filePath).toLowerCase();
        let text = "";

        if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value;
        } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await pdfParse(dataBuffer);
            text = result.text;
        } else {
            console.warn(`Unsupported file type: ${ext}`);
            return null;
        }

        return text;
    } catch (error) {
        console.error(`Error extracting text from CV: ${filePath}`, error);
        return null;
    }
};

module.exports = { extractTextFromCV };

// Bulk Upload Route
// router.post('/bulk-upload', isAdmin, upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file) return res.status(400).json({ error: "CSV file is required" });

//         const results = [];
//         fs.createReadStream(req.file.path)
//             .pipe(csv())
//             .on('data', (data) => results.push(data))
//             .on('end', async () => {
//                 try {
//                     const adminId = req.admin._id; // Get admin ID
//                     console.log(`Admin ID: ${adminId}`);
//                     const adminDetails = await User.findById(adminId); // Fetch admin's details


//                     for (const row of results) {
//                         const { MOD_ID, CV_URL } = row;
//                         if (!MOD_ID || !CV_URL) continue; // Skip invalid rows

//                         console.log(`Processing CV for MOD_ID: ${MOD_ID}`);

//                         // Step 1: Download CV from URL to 'uploads/' folder
//                         const savedFilePath = await downloadFile(CV_URL, MOD_ID);
//                         if (!savedFilePath) {
//                             console.warn(`Failed to download CV for MOD_ID: ${MOD_ID}`);
//                             continue;
//                         }

//                         console.log(`Saved CV for MOD_ID: ${MOD_ID} at ${savedFilePath}`);

//                         // Step 2: Extract text from downloaded CV
//                         const extractedText = await extractTextFromCV(savedFilePath);
//                         if (!extractedText) {
//                             console.warn(`Failed to extract text for MOD_ID: ${MOD_ID}`);
//                             continue;
//                         }

//                         // Step 3: Convert extracted text to JSON using Gemini API
//                         const extractedData = await getJsonFromGemini(extractedText);
//                         if (!extractedData) {
//                             console.warn(`Failed to extract data for MOD_ID: ${MOD_ID}`);
//                             continue;
//                         }

//                         // Step 4: Update or Create User in MongoDB
//                         const existingUser = await User.findOne({ modId: MOD_ID });
//                         console.log("Extracted Data:", extractedData);
//                         console.log("Email before saving:", extractedData.personalInformation.email);

//                         if (existingUser) {
//                             // Update existing user while keeping previous data
//                             await User.updateOne(
//                                 { modId: MOD_ID },
//                                 {
//                                     $set: {
//                                         adminId,
//                                         personalInformation: {
//                                             firstName: extractedData.firstName || null,
//                                             lastName: extractedData.lastName || null,
//                                             email: extractedData.email || null,
//                                             contactNo: extractedData.contactNo || null,
//                                             city: extractedData.city || null,
//                                             state: extractedData.state || null,
//                                             country: extractedData.country || null
//                                         },
//                                         about: {
//                                             description: extractedData.about?.description || null,
//                                             linkedInURL: extractedData.about?.linkedInURL || null,
//                                             professionalTitle: extractedData.about?.professionalTitle || null,
//                                             primaryRole: extractedData.about?.primaryRole || null,
//                                             microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise || null,
//                                             microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct || [],
//                                             yearsOfExperience: extractedData.about?.yearsOfExperience || null
//                                         }
//                                     },
//                                     $addToSet: {
//                                         skills: { $each: extractedData.skills || [] },
//                                         projectExperience: { $each: extractedData.projectExperience || [] },
//                                         Qualification: { $each: extractedData.Qualification || [] },
//                                         workExperience: { $each: extractedData.workExperience || [] }
//                                     }
//                                 }
//                             );

//                         } else {
//                             // Create a new user entry with MOD_ID
//                             await User.create({
//                                 firstName: adminDetails.firstName,
//                                 lastName: adminDetails.lastName,
//                                 contactNo: adminDetails.contactNo,
//                                 // email:adminDetails.email,
//                                 modId: MOD_ID,
//                                 adminId,
//                                 cvPath: savedFilePath,
//                                 personalInformation: {
//                                     firstName: extractedData.personalInformation?.firstName || null,
//                                     lastName: extractedData.personalInformation?.lastName || null,
//                                     email: extractedData.personalInformation?.email || null,  // ✅ FIXED
//                                     contactNo: extractedData.personalInformation?.contactNo || null,
//                                     city: extractedData.personalInformation?.city || null,
//                                     state: extractedData.personalInformation?.state || null,
//                                     country: extractedData.personalInformation?.country || null,
//                                 },
//                                 about: {
//                                     description: extractedData.about?.description || null,
//                                     linkedInURL: extractedData.about?.linkedInURL || null,
//                                     professionalTitle: extractedData.about?.professionalTitle || null,
//                                     primaryRole: extractedData.about?.primaryRole || null,
//                                     microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise || null,
//                                     microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct || [],
//                                     yearsOfExperience: extractedData.about?.yearsOfExperience || null
//                                 },
//                                 skills: extractedData.skills || [],
//                                 projectExperience: extractedData.projectExperience || [],
//                                 Qualification: extractedData.Qualification || [],
//                                 workExperience: extractedData.workExperience || []
//                             });
//                         }
//                     }

//                     res.status(200).json({ message: "Bulk upload processed successfully" });

//                 } catch (error) {
//                     console.error("Error processing CSV:", error);
//                     res.status(500).json({ error: "Failed to process CSV" });
//                 }
//             });

//     } catch (err) {
//         console.error("Error uploading file:", err);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });

// Function to generate a CSV for failed CVs
async function generateFailedCSV(failedRecords) {
    // Ensure the downloads directory exists
    const dir = 'public/downloads';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = `failed_cvs_${Date.now()}.csv`;
    const csvWriter = createObjectCsvWriter({
        path: `${dir}/${filePath}`,
        header: [
            { id: 'MOD_ID', title: 'MOD_ID' },
            { id: 'CV_URL', title: 'CV_URL' },
            { id: 'errors', title: 'Errors' }
        ],
        alwaysQuote: true  // Ensures URLs are properly quoted in CSV
    });
    // console.log(CV_URL);

    // Prepare records for CSV writing
    const recordsForCSV = failedRecords.map(record => ({
        MOD_ID: record.MOD_ID,
        CV_URL: record.CV_URL || '', // Ensure empty string if undefined
        errors: record.errors.join(' | ') // Combine multiple errors
    }));
    // console.log(CV_URL);


    await csvWriter.writeRecords(recordsForCSV);
    console.log(`Generated failed records CSV: ${filePath}`);
    return filePath;
}

// const generateFailedCSV = async (failedRecords) => {
//     const fields = ['MOD_ID', 'CV_URL', 'errors'];
//     const opts = { fields };
//     const parser = new Parser(opts);

//     const csv = parser.parse(failedRecords);
//     const filename = `failed_uploads_${Date.now()}.csv`;
//     const filePath = path.join(__dirname, "../public/downloads", filename);
//     fs.writeFileSync(filePath, csv);
//     return filename;
// };


// Helper to compare work experience entries


router.post('/bulk-upload', isAdmin, upload.single('file'), async (req, res) => {
    // ... (keep all the comparison helper functions as they are)

    try {
        if (!req.file) {
            return res.status(400).json({ error: "CSV file is required" });
        }

        const adminId = req.admin._id;
        const adminDetails = await User.findById(adminId);
        if (!adminDetails) {
            return res.status(404).json({ error: "Admin not found" });
        }

        const results = [];
        const failedRecords = [];
        let processedCount = 0;

        // Parse CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Batch processing with delays
        const batchSize = 2; // Process 10 CVs at a time
        const delayBetweenBatches = 30000; // 30 seconds delay between batches

        const processRecord = async (row) => {
            const recordResult = {
                MOD_ID: row.MOD_ID,
                CV_URL: row.CV_URL || null,
                success: false,
                errors: []
            };

            try {
                const { MOD_ID, CV_URL } = row;
                if (!MOD_ID || !CV_URL) {
                    throw new Error("Missing MOD_ID or CV_URL");
                }
                console.log(`Processing CV for MOD_ID: ${MOD_ID}`);

                // 1. Download CV
                const savedFilePath = await downloadFile(CV_URL, MOD_ID);
                if (!savedFilePath) {
                    throw new Error("Failed to download CV");
                }

                // 2. Extract text from CV
                const extractedText = await extractTextFromCV(savedFilePath);
                if (!extractedText) {
                    throw new Error("Failed to extract text from CV");
                }

                // 3. Convert to JSON using Gemini
                const extractedData = await getJsonFromGemini(extractedText);
                if (!extractedData) {
                    throw new Error("Failed to extract data from text");
                }
                console.log(extractedData);
                
                // Get email from CV
                const cvEmail = extractedData.personalInformation?.email;
                if (!cvEmail) {
                    throw new Error("CV contains no email address - skipping");
                }

                // Check if MOD_ID exists
                const existingUserWithMOD_ID = await User.findOne({ modId: MOD_ID });

                if (existingUserWithMOD_ID) {
                    // CASE 1: Same MOD_ID, same email → DELETE AND RECREATE
                    if (existingUserWithMOD_ID.email === cvEmail) {
                        // Delete the existing record
                        await User.deleteOne({ modId: MOD_ID });
                        
                        // Create new record with the same MOD_ID
                        await User.create({
                            firstName: adminDetails.firstName,
                            lastName: adminDetails.lastName,
                            email: cvEmail,
                            contactNo: adminDetails.contactNo,
                            role: 'user',
                            password: null,
                            modId: MOD_ID,
                            CV_URL: CV_URL,
                            adminId,
                            cvPath: savedFilePath,
                            extractText: extractedText,
                            personalInformation: {
                                firstName: extractedData.personalInformation?.firstName || null,
                                lastName: extractedData.personalInformation?.lastName || null,
                                email: cvEmail,
                                contactNo: extractedData.personalInformation?.contactNo || null,
                                city: extractedData.personalInformation?.city || null,
                                state: extractedData.personalInformation?.state || null,
                                country: extractedData.personalInformation?.country || null,
                            },
                            about: {
                                description: extractedData.about?.description || null,
                                linkedInURL: extractedData.about?.linkedInURL || null,
                                professionalTitle: extractedData.about?.professionalTitle || null,
                                primaryRole: extractedData.about?.primaryRole || null,
                                microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise || null,
                                microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct || [],
                                yearsOfExperience: extractedData.about?.yearsOfExperience || null
                            },
                            skills: extractedData.skills || [],
                            projectExperience: extractedData.projectExperience || [],
                            MicrosoftCertificates: extractedData.MicrosoftCertificates || [],
                            Qualification: extractedData.Qualification || [],
                            workExperience: extractedData.workExperience || []
                        });
                    } else {
                        // Same MOD_ID, different email → SKIP (as before)
                        throw new Error(`Cannot change email for MOD_ID ${MOD_ID} (current: ${existingUserWithMOD_ID.email}, new: ${cvEmail})`);
                    }
                } else {
                    // CASE 2: Different MOD_ID, same email → DELETE OLD AND CREATE NEW
                    const existingUserWithEmail = await User.findOne({ email: cvEmail });

                    if (existingUserWithEmail) {
                        // Delete the existing record with the old MOD_ID
                        await User.deleteOne({ email: cvEmail });
                        
                        // Create new record with the new MOD_ID
                        await User.create({
                            firstName: adminDetails.firstName,
                            lastName: adminDetails.lastName,
                            email: cvEmail,
                            contactNo: adminDetails.contactNo,
                            role: 'user',
                            password: null,
                            modId: MOD_ID,
                            CV_URL: CV_URL,
                            adminId,
                            cvPath: savedFilePath,
                            extractText: extractedText,
                            personalInformation: {
                                firstName: extractedData.personalInformation?.firstName || null,
                                lastName: extractedData.personalInformation?.lastName || null,
                                email: cvEmail,
                                contactNo: extractedData.personalInformation?.contactNo || null,
                                city: extractedData.personalInformation?.city || null,
                                state: extractedData.personalInformation?.state || null,
                                country: extractedData.personalInformation?.country || null,
                            },
                            about: {
                                description: extractedData.about?.description || null,
                                linkedInURL: extractedData.about?.linkedInURL || null,
                                professionalTitle: extractedData.about?.professionalTitle || null,
                                primaryRole: extractedData.about?.primaryRole || null,
                                microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise || null,
                                microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct || [],
                                yearsOfExperience: extractedData.about?.yearsOfExperience || null
                            },
                            skills: extractedData.skills || [],
                            projectExperience: extractedData.projectExperience || [],
                            MicrosoftCertificates: extractedData.MicrosoftCertificates || [],
                            Qualification: extractedData.Qualification || [],
                            workExperience: extractedData.workExperience || []
                        });
                    } else {
                        // CASE 3: New MOD_ID and new email → CREATE (as before)
                        await User.create({
                            firstName: adminDetails.firstName,
                            lastName: adminDetails.lastName,
                            email: cvEmail,
                            contactNo: adminDetails.contactNo,
                            role: 'user',
                            password: null,
                            modId: MOD_ID,
                            CV_URL: CV_URL,
                            adminId,
                            cvPath: savedFilePath,
                            extractText: extractedText,
                            personalInformation: {
                                firstName: extractedData.personalInformation?.firstName || null,
                                lastName: extractedData.personalInformation?.lastName || null,
                                email: cvEmail,
                                contactNo: extractedData.personalInformation?.contactNo || null,
                                city: extractedData.personalInformation?.city || null,
                                state: extractedData.personalInformation?.state || null,
                                country: extractedData.personalInformation?.country || null,
                            },
                            about: {
                                description: extractedData.about?.description || null,
                                linkedInURL: extractedData.about?.linkedInURL || null,
                                professionalTitle: extractedData.about?.professionalTitle || null,
                                primaryRole: extractedData.about?.primaryRole || null,
                                microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise || null,
                                microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct || [],
                                yearsOfExperience: extractedData.about?.yearsOfExperience || null
                            },
                            skills: extractedData.skills || [],
                            projectExperience: extractedData.projectExperience || [],
                            MicrosoftCertificates: extractedData.MicrosoftCertificates || [],
                            Qualification: extractedData.Qualification || [],
                            workExperience: extractedData.workExperience || []
                        });
                    }
                }

                recordResult.success = true;
                processedCount++;
            } catch (error) {
                console.error(`Error processing MOD_ID ${row.MOD_ID || 'unknown'}:`, error);
                recordResult.errors.push(error.message);
                failedRecords.push(recordResult);
            }

            return recordResult;
        };

        // Process in batches with delays
        for (let i = 0; i < results.length; i += batchSize) {
            const batch = results.slice(i, i + batchSize);
            
            // Process current batch
            await Promise.all(batch.map(processRecord));
            
            // Add delay if there are more batches to process
            if (i + batchSize < results.length) {
                console.log(`Processed ${i + batchSize} records. Waiting ${delayBetweenBatches/1000} seconds before next batch...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

         // Generate failed records CSV if there are failed entries
    let failedCsvData = null;
    if (failedRecords.length > 0) {
        const failedCsvData = await generateFailedCSV(failedRecords);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="failed_records_${Date.now()}.csv"`);
        
        // End the response with CSV data
        return res.end(failedCsvData); // Using end() ensures no JSON conversion
      }
           res.status(200).json({
            message: "Bulk upload processed",
            stats: {
                total: results.length,
                success: processedCount,
                failed: failedRecords.length,
            },
            // failedRecords: failedRecords.length > 0 ? failedRecords : undefined,
            // failedCsvPath: failedCsvPath ? `/downloads/${failedCsvPath}` : null
        });

    } catch (err) {
        console.error("Error in bulk upload:", err);
        res.status(500).json({
            error: "Internal Server Error",
            details: err.message
        });
    }
});

async function generateFailedCSV(failedRecords) {
    // Filter out completely empty records if needed
    const validRecords = failedRecords.filter(r => 
        r.MOD_ID || r.CV_URL || (r.errors && r.errors.length)
    );

    const data = validRecords.map(r => ({
        MOD_ID: r.MOD_ID || 'N/A',
        CV_URL: r.CV_URL || 'N/A',
        errors: r.errors?.join('; ') || 'Unknown error'
    }));

    return stringify(data, {
        header: true,
        columns: [
            { key: 'MOD_ID', header: 'MOD_ID' },
            { key: 'CV_URL', header: 'CV_URL' },
            { key: 'errors', header: 'Errors' }
        ],
        quoted: true
    });
}


//just to test with csv containing csv and give correct results
// router.post('/bulk-upload', isAdmin, upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file) return res.status(400).json({ error: "CSV file is required" });

//         const results = [];
//         fs.createReadStream(req.file.path)
//             .pipe(csv())
//             .on('data', (data) => results.push(data))
//             .on('end', async () => {
//                 try {
//                     const adminId = req.admin._id; // Get admin ID
//                     const adminDetails = await User.findById(adminId); // Fetch admin's details

//                     if (!adminDetails) {
//                         return res.status(400).json({ error: "Admin not found" });
//                     }

//                     for (const row of results) {
//                         const { email } = row;
//                         if (!email) continue; // Skip invalid rows

//                         // Check if user already exists
//                         const existingUser = await User.findOne({ email });

//                         if (existingUser) {
//                             // Update existing user with adminId
//                             await User.updateOne(
//                                 { email },
//                                 { $set: { adminId } }
//                             );
//                         } else {
//                             // Create a new user with details from admin
//                             await User.create({
//                                 firstName: adminDetails.firstName,
//                                 lastName: adminDetails.lastName,
//                                 contactNo: adminDetails.contactNo,
//                                 email,
//                                 adminId
//                             });
//                         }
//                     }

//                     res.status(200).json({ message: "Bulk upload processed successfully" });

//                 } catch (error) {
//                     console.error("Error processing CSV:", error);
//                     res.status(500).json({ error: "Failed to process CSV" });
//                 }
//             });

//     } catch (err) {
//         console.error("Error uploading file:", err);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });



//update personal info and store that in extractText field 

router.put("/updatePersonalInfo", authenticateToken, async (req, res) => {
    try {
        const { personalInformation, about } = req.body;

        // Validate required fields
        if (
            !personalInformation.firstName || personalInformation.firstName.trim() === "" ||
            !personalInformation.lastName || personalInformation.lastName.trim() === "" ||
            !personalInformation.email || personalInformation.email.trim() === "" ||
            !personalInformation.contactNo || personalInformation.contactNo.trim() === "" ||
            !personalInformation.city || personalInformation.city.trim() === "" ||
            !personalInformation.state || personalInformation.state.trim() === "" ||
            !personalInformation.country || personalInformation.country === ""
        ) {
            return res.status(400).send({ message: "All fields are required and cannot be empty." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Update only personalInformation and about
        user.personalInformation = personalInformation || user.personalInformation;
        user.about = about || user.about;

        // **Do not update or modify extractText**

        const updatedUser = await user.save();
        res.status(200).send({ message: "Personal Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update about and store that in extractText field 

router.put("/updateAbout", authenticateToken, async (req, res) => {
    try {
        const { about } = req.body;

        // Validate about data
        if (!about || typeof about !== "object") {
            return res.status(400).send({ message: "Invalid or missing data for update." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Update about information
        user.about = { ...user.about, ...about };

        // Update extractText field
        // user.extractText = generateExtractText(user);

        const updatedUser = await user.save();
        res.status(200).send({ message: "About Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update work expe and store that in extractText field 
// router.put("/updateWorkExperience", authenticateToken, async (req, res) => {
//     try {
//         const { workExperience } = req.body;

//         // Validate work experience data
//         if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
//             return res.status(400).send({ message: "Invalid or missing work experience data." });
//         }

//         const user = await User.findById(req.user.userId);
//         if (!user) return res.status(404).send({ message: "User not found." });

//         // Convert existing work experience to a Map for quick lookup
//         const workExperienceMap = new Map(user.workExperience.map(m => [m._id.toString(), m]));

//         // Update or add work experience entries
//         workExperience.forEach((newEntry) => {
//             if (newEntry._id) {
//                 const existingEntry = workExperienceMap.get(newEntry._id.toString());
//                 if (existingEntry) {
//                     Object.keys(newEntry).forEach((key) => {
//                         existingEntry[key] = newEntry[key];
//                     });
//                 } else {
//                     user.workExperience.push(newEntry);
//                 }
//             } else {
//                 user.workExperience.push(newEntry);
//             }
//         });

//         // Update extractText field
//         // user.extractText = generateExtractText(user);

//         const updatedUser = await user.save();
//         res.status(200).send({ message: "Work Experience updated successfully", user: updatedUser });
//     } catch (error) {
//         res.status(500).send({ message: error.message || "Internal Server Error" });
//     }
// });

router.put("/updateWorkExperience", authenticateToken, async (req, res) => {
    try {
        const { workExperience } = req.body;

        // Validate work experience data
        if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
            return res.status(400).send({ message: "Invalid or missing work experience data." });
        }

        // Validate and normalize dates in each work experience entry
        for (const entry of workExperience) {
            if (entry.startDate) {
                entry.startDate = normalizeDate(entry.startDate);
                if (!entry.startDate) {
                    return res.status(400).send({ message: "Invalid start date format." });
                }
            }
            if (entry.endDate) {
                entry.endDate = normalizeDate(entry.endDate);
                if (!entry.endDate) {
                    return res.status(400).send({ message: "Invalid end date format." });
                }
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Replace the entire workExperience array with the new one from the frontend
        user.workExperience = workExperience;

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Work Experience updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});


router.put("/updateWorkExperience/:WorkExperienceId", authenticateToken, async (req, res) => {
    try {
        const { WorkExperienceId } = req.params; // Get the WorkExperienceId from the URL
        const updatedData = req.body; // Get the updated data from the request body

        // Validate updatedData
        if (
            !updatedData.companyName || updatedData.companyName.trim() === "" ||
            !updatedData.jobTitle || updatedData.jobTitle.trim() === "" ||
            !updatedData.designation || updatedData.designation.trim() === "" ||
            !updatedData.industryType || updatedData.industryType.trim() === "" ||
            !updatedData.location || updatedData.location.trim() === "" ||
            !updatedData.description || updatedData.description.trim() === "" ||
            typeof updatedData.currentlyWorking !== "boolean" || // Check if it's a boolean
            !updatedData.startDate || // Check if startDate exists
            !updatedData.startDate.month || updatedData.startDate.month.trim() === "" || // Validate month
            !updatedData.startDate.year || typeof updatedData.startDate.year !== "number" || // Validate year
            !updatedData.endDate || // Check if endDate exists
            !updatedData.endDate.month || updatedData.endDate.month.trim() === "" || // Validate month
            !updatedData.endDate.year || typeof updatedData.endDate.year !== "number" // Validate year
        ) {
            return res.status(400).send({ message: "All fields are required, and currentlyWorking must be a boolean." });
        }

        // Normalize dates
        updatedData.startDate = {
            month: updatedData.startDate.month,
            year: updatedData.startDate.year
        };
        updatedData.endDate = {
            month: updatedData.endDate.month,
            year: updatedData.endDate.year
        };

        // Find the user
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Find the specific work experience entry in the workExperience array
        const workExperienceToUpdate = user.workExperience.id(WorkExperienceId);
        if (!workExperienceToUpdate) {
            return res.status(404).send({ message: "Work experience not found." });
        }

        // Update the work experience fields
        Object.assign(workExperienceToUpdate, updatedData);

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Work experience updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update skills and store that in extractText field 
router.put("/updateSkills", authenticateToken, async (req, res) => {
    try {
        let { skills } = req.body;

        // Validate skills data exists
        if (!skills) {
            return res.status(400).send({ message: "Skills are required." });
        }

        // Normalize skills to always be an array
        if (typeof skills === "string") {
            try {
                skills = JSON.parse(skills);
            } catch (error) {
                // If it's a string but not JSON, treat as single skill
                skills = [skills.trim()];
            }
        } else if (!Array.isArray(skills)) {
            skills = [String(skills).trim()];
        }

        // Clean the skills array
        skills = skills.map(skill => String(skill).trim()).filter(skill => skill);

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Update skills
        user.skills = skills;
        await user.save();

        res.status(200).send({ 
            message: "Skills updated successfully", 
            user: {
                ...user.toObject(),
                skills: user.skills
            }
        });
    } catch (error) {
        console.error("Error updating skills:", error);
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});


//update project info and store that in extractText field 
router.put("/updateProject", authenticateToken, async (req, res) => {
    try {
        const { projectExperience } = req.body;

        // Validate projectExperience data
        if (!projectExperience || !Array.isArray(projectExperience) || projectExperience.length === 0) {
            return res.status(400).send({ message: "Project experience must be a non-empty array." });
        }

        // Validate and normalize dates in each project entry
        for (const entry of projectExperience) {
            if (entry.startDate) {
                entry.startDate = normalizeDate(entry.startDate);
                if (!entry.startDate) {
                    return res.status(400).send({ message: "Invalid start date format." });
                }
            }
            if (entry.endDate) {
                entry.endDate = normalizeDate(entry.endDate);
                if (!entry.endDate) {
                    return res.status(400).send({ message: "Invalid end date format." });
                }
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Replace the entire projectExperience array with the new one from the frontend
        user.projectExperience = projectExperience;

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Project Information updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

router.put("/updateProject/:projectId", authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params; // Get the projectId from the URL
        const updatedData = req.body; // Get the updated data from the request body

        // Validate updatedData
        if (
            !updatedData.projectName || updatedData.projectName.trim() === "" ||
            !updatedData.jobTitle || updatedData.jobTitle.trim() === "" ||
            !updatedData.description || updatedData.description.trim() === "" ||
            !updatedData.startDate || updatedData.startDate.trim() === "" ||
            !updatedData.endDate || updatedData.endDate.trim() === "" ||
            !Array.isArray(updatedData.technologiesUsed) || updatedData.technologiesUsed.length === 0 ||
            updatedData.technologiesUsed.some(tech => typeof tech !== "string" || tech.trim() === "")
        ) {
            return res.status(400).send({ message: "All project fields are required and technologiesUsed must be a non-empty array of strings." });
        }

        // Normalize dates
        updatedData.startDate = normalizeDate(updatedData.startDate);
        updatedData.endDate = normalizeDate(updatedData.endDate);

        // Validate normalized dates
        if (!updatedData.startDate || !updatedData.endDate) {
            return res.status(400).send({ message: "Invalid date format." });
        }

        // Find the user
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Find the specific project in the projectExperience array
        const projectToUpdate = user.projectExperience.id(projectId);
        if (!projectToUpdate) {
            return res.status(404).send({ message: "Project not found." });
        }

        // Update the project fields
        Object.assign(projectToUpdate, updatedData);

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Project updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});


// router.put("/updateProject", authenticateToken, async (req, res) => {
//     try {
//         const { projectExperience } = req.body;

//         // Validate projectExperience data
//         if (!projectExperience || !Array.isArray(projectExperience) || projectExperience.length === 0) {
//             return res.status(400).send({ message: "Project experience must be a non-empty array." });
//         }

//         // Validate each project entry
//         for (const entry of projectExperience) {
//             if (
//                 !entry.projectName || entry.projectName.trim() === "" ||
//                 !entry.jobTitle || entry.jobTitle.trim() === "" ||
//                 !entry.description || entry.description.trim() === "" ||
//                 !entry.startDate || entry.startDate.trim() === "" ||
//                 !entry.endDate || entry.endDate.trim() === "" ||
//                 !Array.isArray(entry.technologiesUsed) || entry.technologiesUsed.length === 0 ||
//                 entry.technologiesUsed.some(tech => typeof tech !== "string" || tech.trim() === "")
//             ) {
//                 return res.status(400).send({ message: "All project fields are required and technologiesUsed must be a non-empty array of strings." });
//             }
//         }

//         const user = await User.findById(req.user.userId);
//         if (!user) return res.status(404).send({ message: "User not found." });

//         // Add new projects
//         user.projectExperience.push(...projectExperience);

//         // Update extractText field
//         user.extractText = generateExtractText(user);

//         const updatedUser = await user.save();
//         res.status(200).send({ message: "Projects added successfully", user: updatedUser });
//     } catch (error) {
//         res.status(500).send({ message: error.message || "Internal Server Error" });
//     }
// });

// router.put("/updateProject/:id", authenticateToken, async (req, res) => {
//     try {
//         const { id } = req.params; // Project ID to update
//         const { projectName, jobTitle, description, technologiesUsed, startDate, endDate } = req.body;

//         // Validate required fields
//         if (
//             !projectName || projectName.trim() === "" ||
//             !jobTitle || jobTitle.trim() === "" ||
//             !description || description.trim() === "" ||
//             !startDate || startDate.trim() === "" ||
//             !endDate || endDate.trim() === "" ||
//             !Array.isArray(technologiesUsed) || technologiesUsed.length === 0 ||
//             technologiesUsed.some(tech => typeof tech !== "string" || tech.trim() === "")
//         ) {
//             return res.status(400).send({ message: "All project fields are required and technologiesUsed must be a non-empty array of strings." });
//         }

//         const user = await User.findById(req.user.userId);
//         if (!user) return res.status(404).send({ message: "User not found." });

//         // Find the project to update
//         const projectToUpdate = user.projectExperience.id(id);
//         if (!projectToUpdate) {
//             return res.status(404).send({ message: "Project not found." });
//         }

//         // Update the project fields
//         projectToUpdate.projectName = projectName;
//         projectToUpdate.jobTitle = jobTitle;
//         projectToUpdate.description = description;
//         projectToUpdate.technologiesUsed = technologiesUsed;
//         projectToUpdate.startDate = startDate;
//         projectToUpdate.endDate = endDate;

//         // Update extractText field
//         user.extractText = generateExtractText(user);

//         const updatedUser = await user.save();
//         res.status(200).send({ message: "Project updated successfully", user: updatedUser });
//     } catch (error) {
//         res.status(500).send({ message: error.message || "Internal Server Error" });
//     }
// });

//update qualification and store that in extractText field 


// router.put("/updateQualifications", authenticateToken, async (req, res) => {
//     try {
//         const { Qualification } = req.body;

//         // Validate Qualification data
//         if (!Qualification || !Array.isArray(Qualification) || Qualification.length === 0) {
//             return res.status(400).send({ message: "No valid education data provided." });
//         }

//         // Validate each Qualification entry
//         for (const entry of Qualification) {
//             if (
//                 !entry.UniversityName || entry.UniversityName.trim() === "" ||
//                 !entry.Degree || entry.Degree.trim() === "" ||
//                 !entry.Field_of_study || entry.Field_of_study.trim() === "" ||
//                 !entry.Start_month_year || entry.Start_month_year.trim() === "" ||
//                 !entry.End_month_year || entry.End_month_year.trim() === "" ||
//                 !entry.description || entry.description.trim() === ""
//             ) {
//                 return res.status(400).send({ message: "All Qualification fields are required and cannot be empty." });
//             }
//         }

//         const user = await User.findById(req.user.userId);
//         if (!user) return res.status(404).send({ message: "User not found." });

//         // Convert existing qualifications to a Map for quick lookup
//         const qualificationMap = new Map(user.Qualification.map(q => [q._id.toString(), q]));

//         // Update or add qualification entries
//         Qualification.forEach((newEntry) => {
//             if (newEntry._id) {
//                 const existingEntry = qualificationMap.get(newEntry._id.toString());

//                 if (existingEntry) {
//                     // Update all fields
//                     Object.keys(newEntry).forEach((key) => {
//                         existingEntry[key] = newEntry[key];
//                     });
//                 } else {
//                     user.Qualification.push(newEntry);
//                 }
//             } else {
//                 user.Qualification.push(newEntry);
//             }
//         });

//         // Update extractText field
//         // user.extractText = generateExtractText(user);

//         const updatedUser = await user.save();
//         res.status(200).send({ message: "Qualification updated successfully", user: updatedUser });
//     } catch (error) {
//         res.status(500).send({ message: error.message || "Internal Server Error" });
//     }
// });

router.put("/updateQualifications", authenticateToken, async (req, res) => {
    try {
        const { Qualification } = req.body;

        // Validate Qualification data
        if (!Qualification || !Array.isArray(Qualification) || Qualification.length === 0) {
            return res.status(400).send({ message: "No valid education data provided." });
        }

        // Validate and normalize dates in each Qualification entry
        for (const entry of Qualification) {
            if (entry.Start_month_year) {
                entry.Start_month_year = normalizeDate(entry.Start_month_year);
                if (!entry.Start_month_year) {
                    return res.status(400).send({ message: "Invalid start date format." });
                }
            }
            if (entry.End_month_year) {
                entry.End_month_year = normalizeDate(entry.End_month_year);
                if (!entry.End_month_year) {
                    return res.status(400).send({ message: "Invalid end date format." });
                }
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Replace the entire Qualification array with the new one from the frontend
        user.Qualification = Qualification;

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Qualification updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

router.put("/updateQualification/:QualificationId", authenticateToken, async (req, res) => {
    try {
        const { QualificationId } = req.params;
        const entry = req.body;

        // Validate entry
        if (
            !entry.UniversityName || entry.UniversityName.trim() === "" ||
            !entry.Degree || entry.Degree.trim() === "" ||
            !entry.Field_of_study || entry.Field_of_study.trim() === "" ||
            !entry.Start_month_year || entry.Start_month_year.trim() === "" ||
            !entry.End_month_year || entry.End_month_year.trim() === "" ||
            !entry.description || entry.description.trim() === ""
        ) {
            return res.status(400).send({
                message: "All Qualification fields are required and cannot be empty."
            });
        }

        // Normalize dates
        entry.Start_month_year = normalizeDate(entry.Start_month_year);
        entry.End_month_year = normalizeDate(entry.End_month_year);

        // Validate normalized dates
        if (!entry.Start_month_year || !entry.End_month_year) {
            return res.status(400).send({ message: "Invalid date format." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Find the specific qualification in the Qualification array
        const qualificationToUpdate = user.Qualification.id(QualificationId);
        if (!qualificationToUpdate) {
            return res.status(404).send({ message: "Qualification not found." });
        }

        // Update the qualification fields
        Object.assign(qualificationToUpdate, entry);

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Qualification updated successfully", user: updatedUser });
    } catch (err) {
        res.status(500).send({ message: err.message || "Internal Server Error" });
    }
});

//update Microsoft certi with _id and store in extractText field and db
router.put('/updateMicrosoftCertificate', authenticateToken, async (req, res) => {
    try {
        const { MicrosoftCertificates } = req.body;

        // Validate MicrosoftCertificates data
        if (!MicrosoftCertificates || !Array.isArray(MicrosoftCertificates)) {
            return res.status(400).send({ message: "Invalid or missing Microsoft Certificate data." });
        }

        // Validate each certificate entry
        for (const entry of MicrosoftCertificates) {
            if (
                !entry.CertificateName || entry.CertificateName.trim() === "" ||
                !entry.DateEarned || entry.DateEarned.trim() === "" ||
                !entry.ValidityDate || entry.ValidityDate.trim() === "" ||
                !entry.certificateURL || entry.certificateURL.trim() === "" ||
                !entry.description || entry.description.trim() === ""
            ) {
                return res.status(400).send({ message: "All Microsoft Certificate fields are required and cannot be empty." });
            }
        }

        // Find user in the database
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Replace the entire MicrosoftCertificates array with the new one from the frontend
        user.MicrosoftCertificates = MicrosoftCertificates;

        // Save updated user data
        const updatedUser = await user.save();
        res.status(200).send({ message: "Microsoft Certifications updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

router.put("/updateMicrosoftCertificate/:MicrosoftCertificateId", authenticateToken, async (req, res) => {
    try {
        const { MicrosoftCertificateId } = req.params; // Get the projectId from the URL
        // console.log(MicrosoftCertificateId);

        const updatedData = req.body;
        // console.log(updatedData);
        // Get the updated data from the request body

        // Validate updatedData
        if (
            !updatedData.CertificateName || updatedData.CertificateName.trim() === "" ||
            !updatedData.DateEarned || updatedData.DateEarned.trim() === "" ||
            !updatedData.ValidityDate || updatedData.ValidityDate.trim() === "" ||
            !updatedData.certificateURL || updatedData.certificateURL.trim() === "" ||
            !updatedData.description || updatedData.description.trim() === ""
        )
        // !Array.isArray(entry.technologiesUsed) || entry.technologiesUsed.length === 0 ||
        // entry.technologiesUsed.some(tech => typeof tech !== "string" || tech.trim() === "")
        {
            return res.status(400).send({ message: "All project fields are required and technologiesUsed must be a non-empty array of strings." });
        }

        // Find the user
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Find the specific project in the projectExperience array
        const MicrosoftCertificateToUpdate = user.MicrosoftCertificates.id(MicrosoftCertificateId);
        if (!MicrosoftCertificateToUpdate) {
            return res.status(404).send({ message: "MicrosoftCertificate not found." });
        }

        // Update the project fields
        Object.assign(MicrosoftCertificateToUpdate, updatedData);

        // Update extractText field (if needed)
        // user.extractText = generateExtractText(user);

        // Save the updated user document
        const updatedUser = await user.save();
        res.status(200).send({ message: "Project updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//to upload CV when user is not uploaded cv at registration
// router.put('/upload-cv', authenticateToken, upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: "No file uploaded" });
//         }

//         const userId = req.user.userId; // Extract user ID from JWT token
//         const user = await User.findById(userId);
//         if (!user) return res.status(404).json({ error: "User not found" });

//         const { path: filePath, originalname: filename } = req.file;
//         const ext = path.extname(filename).toLowerCase();

//         // Extract text from uploaded CV
//         let text = "";
//         if (ext === '.docx') {
//             text = (await mammoth.extractRawText({ path: filePath })).value;
//         } else if (ext === '.pdf') {
//             text = (await pdfParse(fs.readFileSync(filePath))).text;
//         } else {
//             return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
//         }

//         // Extract JSON data from CV using AI model
//         let extractedData = await getJsonFromGemini(text);
//         if (!extractedData || typeof extractedData !== 'object') {
//             console.error("Error: Extracted data is not valid!", extractedData);
//             return res.status(500).json({ error: "Failed to extract data from CV" });
//         }



//         // Handle nested structure in extracted data
//         extractedData = extractedData.data && typeof extractedData.data === 'object' ? extractedData.data : extractedData;

//         // **Update User Information**
//         user.file = req.file.path;
//         user.extractText = text.trim(); // Save extracted text from CV

//         user.personalInformation = {
//             firstName: extractedData.personalInformation?.firstName ?? user.firstName,
//             lastName: extractedData.personalInformation?.lastName ?? user.lastName,
//             email: extractedData.personalInformation?.email ?? user.email,
//             contactNo: extractedData.personalInformation?.contactNo ?? user.contactNo,
//             city: extractedData.personalInformation?.city ?? user.personalInformation?.city ?? null,
//             state: extractedData.personalInformation?.state ?? user.personalInformation?.state ?? null,
//             country: extractedData.personalInformation?.country ?? user.personalInformation?.country ?? null,
//         };

//         user.about = {
//             description: extractedData.about?.description ?? user.about?.description ?? null,
//             linkedInURL: extractedData.about?.linkedInURL ?? user.about?.linkedInURL ?? null,
//             professionalTitle: extractedData.about?.professionalTitle ?? user.about?.professionalTitle ?? null,
//             primaryRole: extractedData.about?.primaryRole ?? user.about?.primaryRole ?? null,
//             microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise ?? user.about?.microsoftDynamicsExpertise ?? null,
//             microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct ?? user.about?.microsoftDynamicsProduct ?? null,
//             yearsOfExperience: extractedData.about?.yearsOfExperience ?? user.about?.yearsOfExperience ?? null,
//         };

//         user.skills = extractedData.skills?.length ? extractedData.skills : user.skills;

//         user.projectExperience = extractedData.projectExperience?.map(proj => ({
//             projectName: proj.projectName || null,
//             jobTitle: proj.jobTitle || null,
//             description: proj.description || null,
//             technologiesUsed: proj.technologiesUsed || [],
//             startDate: proj.startDate || null,
//             endDate: proj.endDate || null,
//         })) ?? user.projectExperience;

//         user.MicrosoftCertificates = extractedData.MicrosoftCertificates?.map(cert => ({
//             CertificateName: cert.CertificateName || null,
//             DateEarned: cert.DateEarned || null,
//             ValidityDate: cert.ValidityDate || null,
//             certificateURL: cert.certificateURL || null,
//             description: cert.description || null,
//         })) ?? user.MicrosoftCertificates;

//         user.Qualification = extractedData.Qualification?.map(edu => ({
//             UniversityName: edu.UniversityName || null,
//             Degree: edu.Degree || null,
//             Field_of_study: edu.Field_of_study || null,
//             Start_month_year: edu.Start_month_year || null,
//             End_month_year: edu.End_month_year || null,
//             description: edu.description || null,
//         })) ?? user.Qualification;

//         user.workExperience = extractedData.workExperience?.map(exp => ({
//             companyName: exp.companyName || null,
//             jobTitle: exp.jobTitle || null,
//             designation: exp.designation || null,
//             industryType: exp.industryType || null,
//             location: exp.location || null,
//             currentlyWorking: exp.currentlyWorking ?? false,
//             startDate: exp.startDate ? { month: exp.startDate?.month, year: exp.startDate?.year } : null,
//             endDate: exp.endDate ? { month: exp.endDate?.month, year: exp.endDate?.year } : null,
//             description: exp.description || null,
//         })) ?? user.workExperience;

//         await user.save();

//         res.status(200).json({
//             message: "CV uploaded and data updated successfully.",
//             extractedData,
//             personalInformation: user.personalInformation,
//             about: user.about,
//             skills: user.skills,
//             projectExperience: user.projectExperience,
//             MicrosoftCertificates: user.MicrosoftCertificates,
//             Qualification: user.Qualification,
//             workExperience: user.workExperience,
//             extractText: user.extractText
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });


router.put('/upload-cv', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.user.userId; // Extract user ID from JWT token
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { path: filePath, originalname: filename } = req.file;
        const ext = path.extname(filename).toLowerCase();

        let text = "";
        if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value;
        } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await pdfParse(dataBuffer);
            text = result.text;
        } else {
            return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
        }

        // **Extract data from CV using Gemini AI**
        let extractedData = await getJsonFromGemini(text);

        // Ensure extractedData is an object
        if (!extractedData || typeof extractedData !== 'object') {
            console.error("Error: Extracted data is not an object!", extractedData);
            return res.status(500).json({ error: "Failed to extract data from CV" });
        }

        // Handle potential nested structure in the response
        if (extractedData.data && typeof extractedData.data === 'object') {
            extractedData = extractedData.data;
        }

        console.log("Final Extracted Data:", extractedData);

        // **Normalize dates in extracted data**
        if (extractedData.Qualification) {
            extractedData.Qualification.forEach(edu => {
                if (edu.Start_month_year) {
                    edu.Start_month_year = normalizeDate(edu.Start_month_year);
                }
                if (edu.End_month_year) {
                    edu.End_month_year = normalizeDate(edu.End_month_year);
                }
            });
        }

        if (extractedData.workExperience) {
            extractedData.workExperience.forEach(exp => {
                if (exp.startDate) {
                    exp.startDate = {
                        month: exp.startDate.month || null,
                        year: exp.startDate.year || null
                    };
                }
                if (exp.endDate) {
                    exp.endDate = {
                        month: exp.endDate.month || null,
                        year: exp.endDate.year || null
                    };
                }
            });
        }

        // **Update personal information**
        const personalInformation = {
            firstName: extractedData.personalInformation?.firstName ?? user.firstName,
            lastName: extractedData.personalInformation?.lastName ?? user.lastName,
            email: extractedData.personalInformation?.email ?? user.email,
            contactNo: extractedData.personalInformation?.contactNo ?? user.contactNo,
            city: extractedData.personalInformation?.city ?? null,
            state: extractedData.personalInformation?.state ?? null,
            country: extractedData.personalInformation?.country ?? null,
        };

        // **Update About Section**
        const about = {
            description: extractedData.about?.description ?? null,
            linkedInURL: extractedData.about?.linkedInURL ?? null,
            professionalTitle: extractedData.about?.professionalTitle ?? null,
            primaryRole: extractedData.about?.primaryRole ?? null,
            microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise ?? null,
            microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct ?? null,
            yearsOfExperience: extractedData.about?.yearsOfExperience ?? null,
        };

        // **Update Skills**
        const skills = extractedData.skills || [];

        // **Update Project Experience**
        const projectExperience = extractedData.projectExperience ? extractedData.projectExperience.map(proj => ({
            projectName: proj.projectName || null,
            jobTitle: proj.jobTitle || null,
            description: proj.description || null,
            technologiesUsed: proj.technologiesUsed || [],
            startDate: proj.startDate || null,
            endDate: proj.endDate || null,
        })) : [];

        // **Update Microsoft Certifications**
        const MicrosoftCertificates = extractedData.MicrosoftCertificates ? extractedData.MicrosoftCertificates.map(cert => ({
            CertificateName: cert.CertificateName || null,
            DateEarned: cert.DateEarned || null,
            ValidityDate: cert.ValidityDate || null,
            certificateURL: cert.certificateURL || null,
            description: cert.description || null,
        })) : [];

        // **Update Educational Qualifications**
        const Qualification = extractedData.Qualification ? extractedData.Qualification.map(edu => ({
            UniversityName: edu.UniversityName || null,
            Degree: edu.Degree || null,
            Field_of_study: edu.Field_of_study || null,
            Start_month_year: edu.Start_month_year || null,
            End_month_year: edu.End_month_year || null,
            description: edu.description || null,
        })) : [];

        // **Update Work Experience**
        const workExperience = extractedData.workExperience ? extractedData.workExperience.map(exp => ({
            companyName: exp.companyName || null,
            jobTitle: exp.jobTitle || null,
            designation: exp.designation || null,
            industryType: exp.industryType || null,
            location: exp.location || null,
            currentlyWorking: exp.currentlyWorking || false,
            startDate: {
                month: exp.startDate?.month || null,
                year: exp.startDate?.year || null
            },
            endDate: {
                month: exp.endDate?.month || null,
                year: exp.endDate?.year || null
            },
            description: exp.description || null,
        })) : [];

        // **Update extractText field with the plain text from the CV**
        const extractText = text.trim();

        // **Update User Document in Database**
        user.file = req.file.path;
        user.extractedData = extractedData;
        user.personalInformation = personalInformation;
        user.about = about;
        user.skills = skills;
        user.projectExperience = projectExperience;
        user.MicrosoftCertificates = MicrosoftCertificates;
        user.Qualification = Qualification;
        user.workExperience = workExperience;
        user.extractText = extractText; // Update extractText field

        await user.save();

        res.status(200).json({
            message: "CV uploaded successfully and extracted data updated.",
            extractedData,
            personalInformation,
            about,
            skills,
            projectExperience,
            MicrosoftCertificates,
            Qualification,
            workExperience,
            extractText // Include extractText in the response
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ATS Score Calculator Functions
// Helper function to calculate keyword match using TF-IDF
const extractJDInfo = async (jobDescription) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const prompt = `You are an advanced job description parser with keyword extraction capabilities. Analyze the job description and extract the following information:

        1. Required Skills (Technical/Hard Skills Only):
           - Extract as an array of specific technical skills
           - Focus on tools, technologies, programming languages, and methodologies
           - Include both explicit mentions and implied requirements
           - Example: ["D365 CRM", "Power Apps", ".NET Core", "Azure Functions"]
        
        2. Years of Experience:
           - Extract exact number when mentioned (e.g., "5+ years" → 5)
           - Infer from seniority terms:
             * "Junior": 1-3 years
             * "Mid-level": 3-5 years  
             * "Senior": 5+ years
             * "Lead/Principal": 7+ years
           - Default to 0 if unclear
        
        3. Education Level:
           - Extract exact degrees mentioned (normalize formats):
             * Bachelor's/B.Tech/B.E./B.Sc → "bachelors"
             * Master's/M.Tech/M.Sc → "masters"  
             * PhD → "phd"
             * Diploma → "diploma"
           - Infer from context if implied but not stated
           - Default to "not specified"
        
        4. Keywords Match (For ATS Optimization):
           - Extract 3 types of keywords:
             a) Primary Skills: Core technical competencies (e.g., "D365", "Power Platform")
             b) Secondary Skills: Nice-to-have technologies (e.g., "Azure DevOps")
             c) Behavioral Traits: Soft skills/attributes (e.g., "team player", "problem-solving")
           - Return as separate arrays for scoring purposes
        
        Response Format (Strict JSON):
        {
          "skills": ["skill1", "skill2"],
          "yearsOfExperience": 5,
          "education": "bachelors",
          "keywords": {
            "primary": ["core_skill1", "core_skill2"],
            "secondary": ["secondary_skill1"],
            "behavioral": ["communication", "leadership"] 
          }
        }
        
        Processing Rules:
        1. Always return valid JSON - use null/empty arrays for missing data
        2. Normalize skill names (e.g., "MS Dynamics" → "Dynamics 365")
        3. Include synonyms and equivalent technologies
        4. For education, prefer the highest mentioned degree
        5. Keywords should be extracted verbatim but deduplicated
        
        Job Description to Parse:
        "${jobDescription}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Log the raw response for debugging
        console.log("Raw Gemini Response:", text);

        // Remove Markdown formatting (e.g., ```json and ```) and clean up
        const jsonString = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .replace(/\n/g, "") // Remove newlines that might break JSON
            .trim();

        // Log the cleaned JSON string
        console.log("Cleaned JSON String:", jsonString);

        // Parse the cleaned JSON string
        let jdInfo;
        try {
            jdInfo = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError.message);
            // Fallback: Manually extract basic info if JSON parsing fails
            jdInfo = {
                skills: extractSkillsFallback(jobDescription),
                yearsOfExperience: extractYearsFallback(jobDescription),
                education: "not specified"
            };
        }

        // Validate and normalize the output
        jdInfo.skills = Array.isArray(jdInfo.skills) ? jdInfo.skills : jdInfo.skills.split(",").map(s => s.trim());
        jdInfo.yearsOfExperience = Number(jdInfo.yearsOfExperience) || 0;
        jdInfo.education = jdInfo.education || "not specified";

        console.log("Final JD Info:", jdInfo);
        return jdInfo;
    } catch (error) {
        console.error("Error extracting JD info:", error.message);
        return null;
    }
};



const calculateKeywordMatch = (resumeText, jobDescription) => {
    try {
        if (!resumeText || !jobDescription) return 0;
        
        const tfidf = new TfIdf();
        tfidf.addDocument(resumeText.toLowerCase());
        
        const jobKeywords = jobDescription.toLowerCase().split(/\W+/).filter(k => k.length > 2);
        if (jobKeywords.length === 0) return 0;
        
        let matches = 0;
        jobKeywords.forEach(keyword => {
            const score = tfidf.tfidf(keyword, 0);
            if (score > 0) matches++;
        });
        
        return (matches / jobKeywords.length) * 100;
    } catch (error) {
        console.error('Error in calculateKeywordMatch:', error);
        return 0;
    }
};

// Helper function to calculate skills match using Jaro-Winkler
const calculateSkillsMatch = (resumeSkills, requiredSkills) => {
    try {
        if (!Array.isArray(resumeSkills) || !Array.isArray(requiredSkills) || requiredSkills.length === 0) {
            return 0;
        }

        let matches = 0;
        requiredSkills.forEach(skill => {
            if (resumeSkills.some(resumeSkill => 
                natural.JaroWinklerDistance(
                    String(resumeSkill).toLowerCase(), 
                    String(skill).toLowerCase()
                ) > 0.8
            )) {
                matches++;
            }
        });
        
        return (matches / requiredSkills.length) * 100;
    } catch (error) {
        console.error('Error in calculateSkillsMatch:', error);
        return 0;
    }
};

// Helper function to calculate experience score
const calculateExperienceScore = (workExperience, requiredYearsOfExperience) => {
    try {
        if (!Array.isArray(workExperience) || !requiredYearsOfExperience) return 0;
        
        let totalYears = workExperience.reduce((years, exp) => {
            if (!exp?.startDate) return years;
            
            const startDate = new Date(exp.startDate);
            let endDate;
            
            if (exp.currentlyWorking) {
                endDate = new Date();
            } else if (exp.endDate) {
                endDate = new Date(exp.endDate);
            } else {
                endDate = startDate;
            }
            
            const yearDiff = (endDate.getFullYear() - startDate.getFullYear()) +
                           (endDate.getMonth() - startDate.getMonth()) / 12;
            
            return years + (yearDiff > 0 ? yearDiff : 0);
        }, 0);
        
        return Math.min(100, (totalYears / requiredYearsOfExperience) * 100);
    } catch (error) {
        console.error('Error in calculateExperienceScore:', error);
        return 0;
    }
};

// Helper function to calculate education score
// const calculateEducationScore = (education, requiredEducation) => {
//     const educationLevels = { 'phd': 4, 'masters': 3, 'bachelors': 2, 'associate': 1, 'diploma': 1 };
//     const requiredLevel = educationLevels[requiredEducation.toLowerCase()] || 0;
//     let highestLevel = Math.max(...education.map(edu => educationLevels[edu.Degree.toLowerCase()] || 0), 0);
//     return highestLevel >= requiredLevel ? 100 : (highestLevel / requiredLevel) * 100;
// };


const calculateEducationScore = (education, requiredEducation) => {
    const educationLevels = {
        'phd': 4, 'doctorate': 4,
        'masters': 3, 'ms': 3, 'm.sc': 3, 'm.tech': 3, 'master': 3, 'mtech': 3,
        'bachelors': 2, 'b.tech': 2, 'b.e': 2, 'b.sc': 2, 'bachelor': 2, 'btech': 2, 'bsc': 2,
        'associate': 1,
        'diploma': 1
    };

    // Normalize the required education input
    const normalizedRequired = String(requiredEducation || '')
        .toLowerCase()
        .replace(/[^a-z]/g, ''); // Remove all non-alphabetic characters

    const requiredLevel = educationLevels[normalizedRequired] || 0;

    // Find highest education level
    let highestLevel = 0;
    education.forEach(edu => {
        if (edu?.Degree) {
            const normalizedDegree = String(edu.Degree)
                .toLowerCase()
                .replace(/[^a-z]/g, ''); // Remove all non-alphabetic characters
            // console.log(normalizedDegree);


            // Check for exact or partial matches
            for (const [key, value] of Object.entries(educationLevels)) {
                if (normalizedDegree.includes(key)) {
                    highestLevel = Math.max(highestLevel, value);
                    break;
                }
            }
        }
    });

    if (requiredLevel === 0) return 100; // If no education requirement
    return highestLevel >= requiredLevel ? 100 : (highestLevel / requiredLevel) * 100;
};

const calculateATSScore = (resume, jdInfo) => {
    try {
        if (!resume || !jdInfo) return { total: 0, details: { keywordMatch: 0, skillsMatch: 0, experienceMatch: 0, educationMatch: 0 }, matchedSkills: [] };

        // Prepare resume text for keyword matching
        const resumeText = [
            resume.about?.description || '',
            ...(resume.skills || []),
            ...(resume.workExperience || []).map(exp => `${exp.jobTitle || ''} ${exp.description || ''}`),
            ...(resume.Qualification || []).map(edu => `${edu.Degree || ''} ${edu.Institution || ''}`)
        ].join(' ');

        // Calculate individual scores
        const keywordScore = calculateKeywordMatch(resumeText, jdInfo.description || '');
        const skillsScore = calculateSkillsMatch(resume.skills || [], jdInfo.skills || []);
        const experienceScore = calculateExperienceScore(resume.workExperience || [], jdInfo.yearsOfExperience || 0);
        const educationScore = calculateEducationScore(resume.Qualification || [], jdInfo.education || 'bachelors');

        // Find matched skills (case-insensitive, using same logic as calculateSkillsMatch)
        const matchedSkills = [];
        (jdInfo.skills || []).forEach(skill => {
            if ((resume.skills || []).some(resumeSkill =>
                natural.JaroWinklerDistance(
                    String(resumeSkill).toLowerCase(),
                    String(skill).toLowerCase()
                ) > 0.8
            )) {
                matchedSkills.push(skill);
            }
        });

        // Calculate weights based on available information
        const weights = {
            keyword: jdInfo.description ? 0.3 : 0,
            skills: Array.isArray(jdInfo.skills) && jdInfo.skills.length > 0 ? 0.3 : 0,
            experience: jdInfo.yearsOfExperience ? 0.25 : 0,
            education: jdInfo.education ? 0.15 : 0
        };

        // Normalize weights if some components are missing
        const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
        if (totalWeight > 0) {
            Object.keys(weights).forEach(key => {
                weights[key] = weights[key] / totalWeight;
            });
        }

        // Calculate total score
        const total = Math.round(
            (keywordScore * weights.keyword) +
            (skillsScore * weights.skills) +
            (experienceScore * weights.experience) +
            (educationScore * weights.education)
        );

        return {
            total,
            details: {
                keywordMatch: Math.round(keywordScore),
                skillsMatch: Math.round(skillsScore),
                experienceMatch: Math.round(experienceScore),
                educationMatch: Math.round(educationScore)
            },
            matchedSkills // <-- now included in the return value
        };
    } catch (error) {
        console.error('Error in calculateATSScore:', error);
        return {
            total: 0,
            details: {
                keywordMatch: 0,
                skillsMatch: 0,
                experienceMatch: 0,
                educationMatch: 0
            },
            matchedSkills: []
        };
    }
};

// Function to get AI-powered feedback from Gemini API
const getGeminiFeedback = async (resumeText, jobDescription) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const prompt = `
            You are ResumeChecker, an expert in ATS optimization and resume tailoring. Analyze the following resume and job description, and provide **clear, structured, and actionable feedback** that is easy for HR professionals and non-technical reviewers to understand. Follow this format:

            1. **Missing Keywords:**
            - Identify the top 5-10 keywords from the job description that are missing in the resume.
            - Suggest specific places in the resume where these keywords can be naturally incorporated.
            - add suggestion for workExperince clearly for each entry
            - suggestion for projectExperince clearly for each entry  

            2. **Reformatting Suggestions:**
            - Provide specific recommendations to improve ATS readability, such as:
                - Consistent formatting (e.g., font, headings, bullet points).
                - Date formats (e.g., use YYYY-MM-DD).
                - Section organization (e.g., skills, experience, education).
            - Highlight any formatting issues that could confuse ATS systems.

            3. **Keyword Density Optimization:**
            - Suggest ways to improve keyword density without keyword stuffing.
            - Provide examples of how to naturally include missing keywords in the professional summary, work experience, and skills sections.

            4. **Tailoring the Resume:**
            - Provide 3-5 specific bullet points on how to tailor the resume for this job description. For example:
                - Highlight relevant experience and skills.
                - Quantify achievements using metrics (e.g., "Increased sales by 20%").
                - Align the resume with the company's values or mission (if mentioned in the job description).

            5. **General Improvements:**
            - Suggest any additional improvements to make the resume stand out, such as:
                - Adding a strong professional summary.
                - Removing irrelevant information.
                - Using action verbs and quantifiable results.

            Resume text: ${resumeText}
            Job description: ${jobDescription}

            Provide your feedback in a clear, structured, and actionable format. Avoid generic advice and focus on specific changes that will improve the resume's ATS compatibility and overall quality.
            `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("Gemini API Response:", text);
        return text;
    } catch (error) {
        console.error("Gemini API Error:", error.message);
        return null;
    }
};

// Search endpoint with ATS scoring and AI feedback
router.get('/search', async (req, res) => {
    try {
        console.log("🔍 Received Search Request with Query Params:", req.query);
        const { keywords } = req.query;
        
        if (!keywords) {
            return res.status(400).json({ 
                message: "Keywords are required.",
                success: false 
            });
        }

        // Split keywords and process them
        const keywordArray = keywords.split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);
        
        if (keywordArray.length === 0) {
            return res.status(400).json({ 
                message: "No valid keywords provided.",
                success: false 
            });
        }

        // Create MongoDB query conditions for each keyword
        const searchConditions = keywordArray.map(keyword => ({
            $or: [
                { 'skills': { $regex: keyword, $options: 'i' } },
                { 'about.description': { $regex: keyword, $options: 'i' } },
                { 'workExperience.jobTitle': { $regex: keyword, $options: 'i' } },
                { 'Qualification.Degree': { $regex: keyword, $options: 'i' } }
            ]
        }));

        // Combine conditions with $and to ensure all keywords are matched
        const query = searchConditions.length > 1 
            ? { $and: searchConditions }
            : searchConditions[0];

        // Get matching users with MongoDB query
        const users = await User.find(query).select([
            'CV_URL',
            'modId',
            'personalInformation.email',
            'personalInformation.firstName',
            'skills',
            'about.description',
            'workExperience',
            'Qualification'
        ]).lean();

        if (!users || users.length === 0) {
            return res.status(404).json({ 
                message: "No matching candidates found.",
                success: false 
            });
        }

        // Calculate relevance scores only for matching candidates
        const usersWithScores = users.map(user => {
            try {
                return {
                    ...user,
                    relevanceScore: calculateRelevanceScore(user, keywordArray)
                };
            } catch (error) {
                console.error('Error processing user:', error);
                return {
                    ...user,
                    relevanceScore: 0
                };
            }
        });

        // Sort by relevance score
        const sortedUsers = usersWithScores.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return res.status(200).json({
            message: "Search results retrieved successfully",
            success: true,
            results: sortedUsers,
            totalResults: sortedUsers.length,
            searchKeywords: keywordArray
        });

    } catch (error) {
        console.error("Search Error:", error);
        return res.status(500).json({ 
            message: "An error occurred while searching",
            success: false,
            error: error.message 
        });
    }
});

router.post('/extract-jd', async (req, res) => {
    try {
        const { jobDescription } = req.body;

        if (!jobDescription) {
            return res.status(400).json({ error: 'Job description is required' });
        }

        const jdInfo = await getCachedJDInfo(jobDescription, extractJDInfo);

        if (!jdInfo) {
            return res.status(500).json({ error: 'Failed to extract JD information' });
        }

        res.json({
            success: true,
            extractedData: {
                skills: jdInfo.skills.map(skill => ({ name: skill, fromJD: true })),
                yearsOfExperience: jdInfo.yearsOfExperience,
                education: jdInfo.education,
                keywords: jdInfo.keywords
            }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

router.post('/search-candidates', async (req, res) => {
    try {
        const {
            searchQuery = '',
            page = 1,
            limit = 20
        } = req.body;

        if (!searchQuery.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        // Split search query into keywords
        const keywords = searchQuery
            .split(/[\s,]+/) // Split by spaces and commas
            .map(k => k.trim())
            .filter(k => k.length > 0);

        // Create search conditions for MongoDB
        const searchConditions = keywords.map(keyword => ({
            $or: [
                { skills: { $regex: keyword, $options: 'i' } },
                { extractText: { $regex: keyword, $options: 'i' } },
                { 'about.description': { $regex: keyword, $options: 'i' } },
                { 'workExperience.jobTitle': { $regex: keyword, $options: 'i' } },
                { 'Qualification.Degree': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.firstName': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.lastName': { $regex: keyword, $options: 'i' } }
            ]
        }));

        const query = searchConditions.length > 0 ? { $and: searchConditions } : {};

        // 📄 Pagination
        const skip = (page - 1) * limit;
        const total = await User.countDocuments(query);

        const candidates = await User.find(query)
            .select([
                'modId',
                'personalInformation.firstName',
                'personalInformation.lastName',
                'skills',
                'extractText',
                'workExperience',
                'Qualification',
                'CV_URL',
                'about'
            ])
            .skip(skip)
            .limit(limit)
            .lean();

        // Process candidates with relevance scoring
        const processedCandidates = candidates.map(candidate => {
            const totalExpYears = candidate.workExperience?.reduce((sum, exp) => {
                if (!exp.startDate) return sum;
                const startDate = new Date(exp.startDate);
                const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
                const diffYears = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);
                return sum + diffYears;
            }, 0);

            // Calculate relevance score
            const relevanceScore = calculateRelevanceScore(candidate, keywords);

            return {
                modId: candidate.modId,
                name: `${candidate.personalInformation?.firstName || ''} ${candidate.personalInformation?.lastName || ''}`.trim(),
                skills: candidate.skills || [],
                education: candidate.Qualification?.[0]?.Degree || 'Not specified',
                jobTitles: [...new Set(candidate.workExperience?.map(exp => exp.jobTitle).flat().filter(Boolean))] || [],
                experience: totalExpYears ? Math.round(totalExpYears * 10) / 10 + ' years' : 'Not specified',
                cvUrl: candidate.CV_URL,
                textPreview: candidate.extractText?.substring(0, 100) + (candidate.extractText?.length > 100 ? '...' : ''),
                relevanceScore: Math.round(relevanceScore * 100) / 100, // Round to 2 decimal places
                about: candidate.about?.description || ''
            };
        });

        // Sort by relevance score
        processedCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

        res.json({
            success: true,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            },
            searchQuery,
            keywords,
            candidates: processedCandidates
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


router.post('/calculate-selected-ats', async (req, res) => {
    try {
        const { jobDescriptionText, selectedModIds, additionalSkills = [] } = req.body;

        if (!jobDescriptionText || !selectedModIds || !Array.isArray(selectedModIds)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request data. Job description and selected candidates are required.'
            });
        }

        // Get JD analysis using cache
        const jdInfo = await getCachedJDInfo(jobDescriptionText, extractJDInfo);
        if (!jdInfo) {
            return res.status(500).json({
                success: false,
                error: 'Failed to analyze job description'
            });
        }

        // Add additional skills to JD info
        jdInfo.skills = [...new Set([...jdInfo.skills, ...additionalSkills])];

        // Get the candidates
        const candidates = await User.find({ modId: { $in: selectedModIds } });
        if (!candidates || candidates.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No candidates found with the provided MOD IDs'
            });
        }

        // Calculate ATS scores for each candidate
        const results = await Promise.all(candidates.map(async (candidate) => {
            try {
                // Calculate ATS score using existing function
                const score = calculateATSScore(candidate, jdInfo);

                // Only generate AI feedback if total score > 70
                let feedback = '';
                if (score.total > 70) {
                    try {
                        feedback = await getGeminiFeedback(candidate.extractText || '', jobDescriptionText);
                    } catch (feedbackError) {
                        console.error(`Error getting AI feedback for candidate ${candidate.modId}:`, feedbackError);
                        feedback = "Could not generate AI feedback at this time.";
                    }
                } else {
                    feedback = "AI feedback is only generated for candidates with ATS scores above 70.";
                }

                return {
                    modId: candidate.modId,
                    name: `${candidate.personalInformation?.firstName || ''} ${candidate.personalInformation?.lastName || ''}`.trim(),
                    atsScore: score.total,
                    scoreDetails: {
                        keywordMatch: score.details.keywordMatch,
                        skillsMatch: score.details.skillsMatch,
                        experienceMatch: score.details.experienceMatch,
                        educationMatch: score.details.educationMatch
                    },
                    matchedSkills: score.matchedSkills || [],
                    aiFeedback: feedback
                };
            } catch (error) {
                console.error(`Error processing candidate ${candidate.modId}:`, error);
                return {
                    modId: candidate.modId,
                    error: 'Failed to process candidate: ' + error.message
                };
            }
        }));

        // Filter and sort results
        const successfulResults = results.filter(r => !r.error);
        const failedResults = results.filter(r => r.error);

        successfulResults.sort((a, b) => b.atsScore - a.atsScore);

        return res.json({
            success: true,
            results: successfulResults,
            jdAnalysis: {
                ...jdInfo,
                combinedSkills: [...new Set([...jdInfo.skills])]
            },
            failedResults: failedResults.length > 0 ? failedResults : undefined
        });

    } catch (error) {
        console.error('Calculation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});


// function to generate pdf from database data
// const generateCV = async (userId) => {
//     try {
//         const user = await User.findById(userId).select("-password -extractedData -file");
//         if (!user) {
//             throw new Error("User not found");
//         }

//         const pdfDir = path.join(__dirname, "../public/pdfs");
//         if (!fs.existsSync(pdfDir)) {
//             fs.mkdirSync(pdfDir, { recursive: true });
//         }

//         const pdfPath = path.join(pdfDir, `${user._id}_CV.pdf`);
//         const doc = new PDFDocument({ size: "A4", margin: 50 });
//         const writeStream = fs.createWriteStream(pdfPath);
//         doc.pipe(writeStream);

//         // **Header (Name, Contact, LinkedIn, Email)**
//         doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
//         doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
//         doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
//         doc.moveDown();

//         // **Professional Summary**
//         if (user.about.description) {
//             doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.about.description).moveDown();
//         }

//         // **Skills** (Limited to 6)
//         if (user.skills.length) {
//             doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
//         }

//         // **Work Experience** (Show only last 2 jobs)
//         if (user.workExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
//             user.workExperience.slice(0, 2).forEach((work) => {
//                 doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
//                 if (work.description) {
//                     doc.fontSize(11).text(work.description, { lineGap: 3 });
//                 }
//                 doc.moveDown();
//             });
//         }

//         // **Education** (Show only highest qualification)
//         // if (user.Qualification.length) {
//         //     doc.fontSize(14).fillColor("black").text("Educationnn", { underline: true }).moveDown(0.3);
//         //     const highestEdu = user.Qualification.slice(0, 1);
//         //     highestEdu.forEach((edu) => {
//         //         doc.fontSize(12).text(`${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
//         //         doc.moveDown();
//         //     });
//         // }

//         if (user.Qualification && user.Qualification.length > 0) {
//             doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);

//             user.Qualification.forEach((edu, index) => {
//                 // console.log(`Processing Education Entry ${index + 1}:`, edu); // Debugging

//                 const degree = edu.Degree || "N/A";
//                 const field = edu.Field_of_study || "N/A";
//                 const university = edu.UniversityName || "N/A";
//                 const startDate = edu.Start_month_year ? edu.Start_month_year : "Unknown";
//                 const endDate = edu.End_month_year ? edu.End_month_year : "Unknown";

//                 doc.fontSize(12).text(`${index + 1}. ${degree} in ${field}, ${university} (${startDate} - ${endDate})`);
//                 doc.moveDown(); // Ensures proper spacing
//             });
//         }

//         // **Certifications** (Show max 2)
//         if (user.MicrosoftCertificates.length) {
//             doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
//             user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
//                 doc.fontSize(12).text(`${cert.CertificateName} - ${cert.DateEarned}`);
//             });
//             doc.moveDown();
//         }

//         // **Projects** (Show only 1 project)
//         if (user.projectExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);

//             user.projectExperience.forEach((proj) => {
//                 doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
//                 doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
//                 doc.fontSize(11).text(proj.description);
//                 doc.moveDown(); // Adds spacing between projects
//             });
//         }


//         // End document
//         doc.end();

//         return pdfPath;
//     } catch (error) {
//         console.error("Error generating CV:", error);
//         throw error;
//     }
// };


//when mannually entered data generated CV at that time that data will convert to the extractedText
// const generateCV = async (userId) => {
//     try {
//         const user = await User.findById(userId).select("-password -file");
//         if (!user) {
//             throw new Error("User not found");
//         }

//         const pdfDir = path.join(__dirname, "../public/pdfs");
//         if (!fs.existsSync(pdfDir)) {
//             fs.mkdirSync(pdfDir, { recursive: true });
//         }

//         const pdfPath = path.join(pdfDir, `${user._id}_CV.pdf`);
//         const doc = new PDFDocument({ size: "A4", margin: 50 });
//         const writeStream = fs.createWriteStream(pdfPath);
//         doc.pipe(writeStream);

//         let extractedText = ""; // Store extracted text

//         // **Header (Name, Contact, LinkedIn, Email)**
//         const headerText = `
//         ${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}
//         ${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}
//         ${user.about.linkedInURL || ""}
//         `;
//         extractedText += headerText + "\n\n";

//         doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
//         doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
//         doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
//         doc.moveDown();

//         // **Professional Summary**
//         if (user.about.description) {
//             extractedText += `Professional Summary:\n${user.about.description}\n\n`;
//             doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.about.description).moveDown();
//         }

//         // **Skills** (Limited to 6)
//         if (user.skills.length) {
//             extractedText += `Skills:\n${user.skills.slice(0, 6).join(", ")}\n\n`;
//             doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
//         }

//         // **Work Experience** (Show only last 2 jobs)
//         if (user.workExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
//             user.workExperience.slice(0, 2).forEach((work) => {
//                 const workText = `${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})\n${work.description || ""}\n\n`;
//                 extractedText += workText;

//                 doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
//                 if (work.description) {
//                     doc.fontSize(11).text(work.description, { lineGap: 3 });
//                 }
//                 doc.moveDown();
//             });
//         }

//         // **Education** (All qualifications)
//         if (user.Qualification && user.Qualification.length > 0) {
//             doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);

//             user.Qualification.forEach((edu, index) => {
//                 const eduText = `${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})\n\n`;
//                 extractedText += eduText;

//                 doc.fontSize(12).text(`${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
//                 doc.moveDown();
//             });
//         }

//         // **Certifications** (Show max 2)
//         if (user.MicrosoftCertificates.length) {
//             doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
//             user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
//                 const certText = `${cert.CertificateName} - ${cert.DateEarned}\n`;
//                 extractedText += certText;

//                 doc.fontSize(12).text(certText);
//             });
//             doc.moveDown();
//         }

//         // **Projects** (All projects)
//         if (user.projectExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);

//             user.projectExperience.forEach((proj) => {
//                 const projText = `${proj.projectName} (${proj.startDate} - ${proj.endDate})\nTech Used: ${proj.technologiesUsed.join(", ")}\n${proj.description}\n\n`;
//                 extractedText += projText;

//                 doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
//                 doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
//                 doc.fontSize(11).text(proj.description);
//                 doc.moveDown();
//             });
//         }

//         // End document
//         doc.end();

//         // Wait for the PDF to finish writing before proceeding
//         await new Promise((resolve, reject) => {
//             writeStream.on("finish", resolve);
//             writeStream.on("error", reject);
//         });

//         // **Update user's extractText field with extracted content**
//         user.extractText = {
//             content: extractedText.trim(),

//             fileType: "pdf",
//             generatedAt: new Date(),
//         };

//         await user.save();

//         return pdfPath;
//     } catch (error) {
//         console.error("Error generating CV:", error);
//         throw error;
//     }
// };

const generateCV = async (userId) => {
    try {
        const user = await User.findById(userId).select("-password -file");
        if (!user) {
            throw new Error("User not found");
        }

        const pdfDir = path.join(__dirname, "../public/pdfs");
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        const pdfPath = path.join(pdfDir, `${user._id}_CV.pdf`);
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        let extractedText = ""; // Store extracted text as a string

        // **Header (Name, Contact, LinkedIn, Email)**
        const headerText = `${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}
            ${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}
            ${user.about.linkedInURL || ""}\n\n`;

        extractedText += headerText;

        doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
        doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
        doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
        doc.moveDown();

        // **Professional Summary**
        if (user.about.description) {
            extractedText += `Professional Summary:\n${user.about.description}\n\n`;
            doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.about.description).moveDown();
        }

        // **Skills** (Limited to 6)
        if (user.skills.length) {
            extractedText += `Skills:\n${user.skills.slice(0, 6).join(", ")}\n\n`;
            doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
        }

        // **Work Experience** (Show only last 2 jobs)
        if (user.workExperience.length) {
            doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
            user.workExperience.slice(0, 2).forEach((work) => {
                const workText = `${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})
                    ${work.description || ""}\n\n`;

                extractedText += workText;
                doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
                if (work.description) {
                    doc.fontSize(11).text(work.description, { lineGap: 3 });
                }
                doc.moveDown();
            });
        }

        // **Education** (All qualifications)
        if (user.Qualification && user.Qualification.length > 0) {
            doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);
            user.Qualification.forEach((edu, index) => {
                const eduText = `${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})\n\n`;
                extractedText += eduText;

                doc.fontSize(12).text(`${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
                doc.moveDown();
            });
        }

        // **Certifications** (Show max 2)
        if (user.MicrosoftCertificates.length) {
            doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
            user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
                const certText = `${cert.CertificateName} - ${cert.DateEarned}\n`;
                extractedText += certText;
                doc.fontSize(12).text(certText);
            });
            doc.moveDown();
        }

        // **Projects** (All projects)
        if (user.projectExperience.length) {
            doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);
            user.projectExperience.forEach((proj) => {
                const projText = `${proj.projectName} (${proj.startDate} - ${proj.endDate})\nTech Used: ${proj.technologiesUsed.join(", ")}\n${proj.description}\n\n`;
                extractedText += projText;

                doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
                doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
                doc.fontSize(11).text(proj.description);
                doc.moveDown();
            });
        }

        // End document
        doc.end();

        // Wait for the PDF to finish writing before proceeding
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        // **Update user's extractText field as a string**
        user.extractText = extractedText.trim();

        await user.save();

        return pdfPath;
    } catch (error) {
        console.error("Error generating CV:", error);
        throw error;
    }
};

//route to generate pdf
router.get("/generate-cv/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const pdfPath = await generateCV(userId);
        
        // Set headers for direct download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=LiveD365_Resume.pdf`);
        
        // Send the file directly
        return res.sendFile(pdfPath);
    } catch (error) {
        return res.status(500).json({ message: "Error generating CV", error: error.message });
    }
});

// Helper function to calculate fuzzy match score with error handling
const calculateFuzzyScore = (text, keyword) => {
    try {
        if (!text || !keyword) return 0;
        
        const safeText = safeString(text);
        const safeKeyword = safeString(keyword);
        
        if (!safeText || !safeKeyword) return 0;
        
        const score = fuzzball.ratio(safeText, safeKeyword);
        return isNaN(score) ? 0 : score;
    } catch (error) {
        console.error('Error in calculateFuzzyScore:', error, 'Text:', text, 'Keyword:', keyword);
        return 0;
    }
};

// Helper function to extract keywords using NLP
const extractKeywords = (text) => {
    const tfidf = new TfIdf();
    tfidf.addDocument(text);
    return tfidf.listTerms(0).slice(0, 5).map(item => item.term);
};

// Helper function to calculate relevance score
const calculateRelevanceScore = (user, keywords) => {
    let score = 0;
    const weights = {
        skills: 0.4,
        description: 0.3,
        jobTitle: 0.2,
        degree: 0.1
    };

    // Process each keyword
    keywords.forEach(keyword => {
        // Check skills
        if (Array.isArray(user.skills)) {
            const skillMatch = user.skills.reduce((max, skill) => {
                const matchScore = calculateFuzzyScore(skill, keyword);
                return Math.max(max, matchScore);
            }, 0);
            score += (skillMatch / 100) * weights.skills;
        }

        // Check description
        if (user.about?.description) {
            const descScore = calculateFuzzyScore(user.about.description, keyword);
            score += (descScore / 100) * weights.description;
        }

        // Check work experience
        if (Array.isArray(user.workExperience)) {
            const expScore = user.workExperience.reduce((max, exp) => {
                const matchScore = calculateFuzzyScore(exp?.jobTitle, keyword);
                return Math.max(max, matchScore);
            }, 0);
            score += (expScore / 100) * weights.jobTitle;
        }

        // Check qualifications
        if (Array.isArray(user.Qualification)) {
            const qualScore = user.Qualification.reduce((max, qual) => {
                const matchScore = calculateFuzzyScore(qual?.Degree, keyword);
                return Math.max(max, matchScore);
            }, 0);
            score += (qualScore / 100) * weights.degree;
        }
    });

    return score;
};

// Helper function to safely convert text to string and lowercase
const safeString = (text) => {
    if (text === null || text === undefined) return '';
    if (typeof text === 'object') {
        try {
            return JSON.stringify(text).toLowerCase().trim();
        } catch (e) {
            return '';
        }
    }
    if (typeof text === 'number') {
        return String(text).toLowerCase().trim();
    }
    if (typeof text !== 'string') {
        try {
            return String(text).toLowerCase().trim();
        } catch (e) {
            return '';
        }
    }
    return text.toLowerCase().trim();
};

// Cache for storing JD analysis results
const jdCache = new Map();
const CACHE_EXPIRY = 1000 * 60 * 60; // 1 hour in milliseconds

// Function to get cached JD info or extract new info
const getCachedJDInfo = async (jobDescription, extractFunction) => {
    try {
        // Create a cache key from the job description
        const cacheKey = jobDescription.trim().toLowerCase();

        // Check if we have a valid cached result
        const cachedResult = jdCache.get(cacheKey);
        if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_EXPIRY) {
            console.log('Using cached JD analysis');
            return cachedResult.data;
        }

        // If no valid cache, extract new information
        console.log('Extracting new JD analysis');
        const extractedInfo = await extractFunction(jobDescription);

        // Cache the result
        jdCache.set(cacheKey, {
            data: extractedInfo,
            timestamp: Date.now()
        });

        return extractedInfo;
    } catch (error) {
        console.error('Error in getCachedJDInfo:', error);
        throw error;
    }
};

// Get user by ID
router.get("/user/:userId", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; // Get userId from the authenticated token
        console.log('Fetching user data for ID:', userId);

        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found for ID:', userId);
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ 
            message: "User data retrieved successfully",
            user: {
                _id: user._id.toString(),
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                personalInformation: user.personalInformation || {},
                about: user.about || {},
                skills: user.skills || [],
                workExperience: user.workExperience || [],
                projectExperience: user.projectExperience || [],
                Qualification: user.Qualification || [],
                MicrosoftCertificates: user.MicrosoftCertificates || []
            }
        });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
