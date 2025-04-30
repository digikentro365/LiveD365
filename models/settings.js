const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  geminiApiKey: {
    type: String,
    required: true,
    default: process.env.GEMINI_API_KEY
  },
  jsonExtractionPrompt: {
    type: String,
    required: true,
    default: "Extract the following information from the text and return it as JSON..."
  },
  jdExtractionPrompt: {
    type: String,
    required: true,
    default: "Analyze this job description and extract key requirements..."
  },
  feedbackPrompt: {
    type: String,
    required: true,
    default: "Review this resume against the job requirements..."
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add a method to get current settings
settingsSchema.statics.getCurrentSettings = async function() {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  if (!settings) {
    // Create default settings if none exist
    return await this.create({
      geminiApiKey: process.env.GEMINI_API_KEY,
      jsonExtractionPrompt: "Extract the following information from the text and return it as JSON...",
      jdExtractionPrompt: "Analyze this job description and extract key requirements...",
      feedbackPrompt: "Review this resume against the job requirements..."
    });
  }
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings; 