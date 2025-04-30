const mongoose = require('mongoose');

const AdminUploadSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    uploadedEmails: [{ type: String }]
});

// module.exports = mongoose.model('AdminUpload', AdminUploadSchema);
const admin = mongoose.model('Admin', AdminUploadSchema);
module.exports = admin;

