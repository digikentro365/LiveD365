const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');  
const { Certificate } = require('crypto');
const { type } = require('os');

// const userSchema = new mongoose.Schema({
//     token: {type: String},
//     role: {
//         type: String,
//         enum: ['user', 'admin'], // Allowed roles
//         default: 'user' // Default role is 'user'
//     },
//     firstName: {
//         type: String,
//         required: true
//     },
//     lastName: {
//         type: String,
//         required: true
//     },
//     email: {
//         type: String,
//         required: true,
//         unique: true,
//         match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"]
//     },

//     password: {
//         type: String,
//         required: true,
//         minlength: 8,  // Length check only; regex validation is removed
//     },

//     contactNo: {
//         type: String,
//         required: true,
//         match: [/^\d{10}$/, "Contact number must be exactly 10 digits."]
//     },
//     // extractedData: { type: Object }, 
//     extractText: { type: String }, // Stores extracted text in object format

//     // personalInformation: {
//     //     firstName: { type: String, default: null },
//     //     lastName: { type: String, default: null },
//     //     email: {
//     //         type: String,
//     //         // default: null,
//     //         sparse : true,
//     //         match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"]
//     //     },
//     //     contactNo: {
//     //         type: String,
//     //         default: null,
//     //         // match: [/^\d{10}$/, "Contact number must be exactly 10 digits."]
//     //     },
//     //     city: { type: String, default: null },
//     //     state: { type: String, default: null },
//     //     country: { type: String, default: null }
//     // },

//     personalInformation: {
//         firstName: { type: String, default: null },
//         lastName: { type: String, default: null },
//         email: {
//             type: String, 
//             sparse: true,
//             validate: {
//                 validator: function (email) {
//                     // Validate single email format
//                     return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
//                 },
//                 message: "Invalid email format."
//             }
//         },
//         contactNo: {
//             type: String,
//             default: null,
//         },
//         city: { type: String, default: null },
//         state: { type: String, default: null },
//         country: { type: String, default: null }
//     },

//     about: {
//         description: { type: String, default: null },
//         linkedInURL: {
//             type: String,
//             default: null,
//             match: [/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9\-_]+\/?$/, "Invalid LinkedIn URL"]
//         },
//         professionalTitle: { type: String, default: null },
//         primaryRole: { type: String, default: null },
//         microsoftDynamicsExpertise: { type: String, default: null },
//         microsoftDynamicsProduct: { type: [String], default: null }, // Change to array of strings
//         yearsOfExperience: { type: Number, default: null }
//     },

//     skills: [{ type: String , default: null }],

//     projectExperience: [{
//         projectName: { type: String, default: null },
//         jobTitle:{type : String, default: null },
//         description: { type: String, default: null },
//         technologiesUsed: [String],
//         startDate: { type: String, default: null },
//         endDate: { type: String, default: null },
//     }],

//     MicrosoftCertificates:[{
//         CertificateName : {type: String, default:null},
//         DateEarned : {type: String , default: null},
//         ValidityDate: {type: String, default: null},
//         certificateURL: { 
//             type: String, 
//            default: null,
//             match: [/^https?:\/\/[^\s$.?#].[^\s]*$/, "Invalid URL format"] 
//         }, // URL to the certificate
//         description:{type: String, default: null}
//     }],

//     Qualification: [{
//         UniversityName:{type: String, default: null},
//         Degree :{type: String, default: null},
//         Field_of_study :{type: String , default: null},
//         Start_month_year: { type: String, default: null }, // Store as a single string
//         End_month_year: { type: String, default: null },  // Store as a single string
//         description: {type: String, default: null}

//     }],

//     workExperience: [{
//         companyName: { type: String, default: null },
//         jobTitle: { type: String, default: null },
//         designation: { type: String, default: null },
//         industryType: { type: String, default: null },
//         location: { type: String, default: null },
//         currentlyWorking: { type: Boolean, default: false },
//         // startDate: {
//         //     month: { type: String, default: null },
//         //     year: { type: Number, default: null }
//         // },
//         // endDate: {
//         //     month: { type: String, default: null },
//         //     year: { type: Number, default: null }
//         // },
//         startDate: { type: String, default: null }, // Store as a single string
//         endDate: { type: String, default: null },   // Store as a single string
//         description: { type: String, default: null }
//     }],
//     file: { type: String },
// }, { timestamps: true });

const userSchema = new mongoose.Schema({
    token: { type: String },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    adminId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }, // Stores admin ID or remains null if user uploads

    firstName: { type: String },
    lastName: { type: String},
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"]
    },

    password: { type: String,  minlength: 8 },
    contactNo: {
        type: String,
        required: true,
        match: [/^\d{10}$/, "Contact number must be exactly 10 digits."]
    },

    extractText: { type: String },
    modId: { type: String, default: null},  // Store MOD_ID
    CV_URL: {type: String},

    personalInformation: {
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        email: {
            type: String, 
            sparse: true,
            default: null,
            validate: {
                validator: function(email) {
                    // Skip validation if null/undefined
                    if (email == null) return true;
                    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                },
                message: "Invalid email format."
            }
        },
        contactNo: { type: String, default: null },
        city: { type: String, default: null },
        state: { type: String, default: null },
        country: { type: String, default: null }
    },

    about: {
        description: { type: String, default: null },
        linkedInURL: {
            type: String,
            default: null
            // match: [/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9\-_]+\/?$/, "Invalid LinkedIn URL"]
        },
        professionalTitle: { type: String, default: null },
        primaryRole: { type: String, default: null },
        microsoftDynamicsExpertise: { type: [String], default: null },
        microsoftDynamicsProduct: { type: [String], default: null },
        yearsOfExperience: { type: String, default: null }
    },

    skills: { 
        type: [String], 
        default: [] // Changed from null to empty array
      },
      
    projectExperience: [{
        projectName: { type: String, default: null },
        jobTitle: { type: String, default: null },
        description: { type: String, default: null },
        technologiesUsed: [String],
        startDate: { type: String, default: null },
        endDate: { type: String, default: null },
    }],

    MicrosoftCertificates: [{
        CertificateName: { type: String, default: null },
        DateEarned: { type: String, default: null },
        ValidityDate: { type: String, default: null },
        certificateURL: { 
            type: String, 
            default: null,
            match: [/^https?:\/\/[^\s$.?#].[^\s]*$/, "Invalid URL format"] 
        },
        description: { type: String, default: null }
    }],

    Qualification: [{
        UniversityName: { type: String, default: null },
        Degree: { type: String, default: null },
        Field_of_study: { type: String, default: null },
        Start_month_year: { type: String, default: null },
        End_month_year: { type: String, default: null },
        description: { type: String, default: null }
    }],

    workExperience: [{
        companyName: { type: String, default: null },
        jobTitle: { type: [String], default: null },
        designation: { type: [String], default: null },
        industryType: { type: String, default: null },
        location: { type: String, default: null },
        currentlyWorking: { type: Boolean, default: false },
        startDate: { type: String, default: null },
        endDate: { type: String, default: null },
        description: { type: String, default: null }
    }],

    file: { type: String }
}, { timestamps: true });




/* 
 * Mongoose Middleware - Hash Password Before Saving 
 */
// userSchema.pre('save', async function (next) {
//     if (!this.isModified('password')) return next();
//     try {
//         const salt = await bcrypt.genSalt(10);
//         this.password = await bcrypt.hash(this.password, salt);
//         next();
//     } catch (error) {
//         next(error);
//     }
// });

// Model
const User = mongoose.model('User', userSchema);

module.exports = User;

