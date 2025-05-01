import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL + '/auth';

const API = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add request interceptor to include token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for handling auth errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid auth data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API Requests
export const registerUser = (userData) => API.post('/register', userData);
export const verifyCode = (email, code) => API.post('/verify-code', { email, code });
export const loginUser = async (credentials) => {
  try {
    const response = await API.post('/login', credentials);
    return response;
  } catch (error) {
    console.error("Login API Error:", error.response?.data || error.message);
    throw error;
  }
};

export const searchCandidates = (searchQuery) => API.post('/search-candidates', { 
    searchQuery
});

export const searchUsers = (keywords) => API.get('/search', { 
    params: { 
        keywords: Array.isArray(keywords) ? keywords.join(',') : keywords 
    } 
});

export const bulkUploadCandidates = (formData) =>
  API.post('/bulk-upload', formData, { 
    headers: { 
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    responseType: 'blob' // Essential for file downloads
  });

export const extractJD = async (jobDescription) => {
    try {
        const response = await API.post('/extract-jd', { jobDescription });
        return response;
    } catch (error) {
        throw error;
    }
};

export const calculateATS = async (data) => {
    try {
        // Ensure data is properly formatted
        const formattedData = {
            jobDescriptionText: data.jobDescriptionText || data.jobDescription,
            selectedModIds: data.selectedModIds.map(id => String(id)), // Ensure IDs are strings
            additionalSkills: Array.isArray(data.additionalSkills) 
                ? data.additionalSkills.filter(skill => skill && typeof skill === 'string')
                : []
        };

        console.log('Formatted ATS calculation request:', formattedData);

        const response = await API.post('/calculate-selected-ats', formattedData);
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
        return response;
    } catch (error) {
        console.error('ATS Calculation API Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getUserById = async (userId) => {
  try {
    const response = await API.get(`/user/${userId}`);
    console.log('Get User Response:', response.data); // Debug log
    
    // Check if we have the expected response structure
    if (response.data && response.data.user) {
      return response.data;
    } else {
      throw new Error('Invalid response format from server');
    }
  } catch (error) {
    console.error("Get User Error:", error);
    if (error.response) {
      console.error("Error Response:", error.response.data);
    }
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch user data');
  }
};

export const generateResumePDF = (userId) => API.get(`/generate-cv/${userId}`);

export const updatePersonalInfo = (data) => API.put('/updatePersonalInfo', data);
export const updateAbout = (data) => API.put('/updateAbout', data);
export const updateSkills = (data) => API.put('/updateSkills', data);
export const updateWorkExperience = (data) => API.put('/updateWorkExperience', data);
export const updateProjectExperience = (data) => API.put('/updateProject', data);
export const updateQualifications = (data) => API.put('/updateQualifications', data);
export const updateMicrosoftCertificates = (data) => API.put('/updateMicrosoftCertificate', data);

export default API;
