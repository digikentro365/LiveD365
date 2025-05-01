import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../services/api';
import { TextField, Button, Container, Typography, Box, Input, Paper } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Logo from '../components/Logo';

const Register = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    contactNo: '',
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['application/pdf', 'application/msword', 
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
      } else {
        setError('Please upload a PDF or DOC/DOCX file');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const formDataToSend = new FormData();
      
      // Append all form fields
      Object.entries(formData).forEach(([key, value]) => {
        formDataToSend.append(key, value);
      });
      
      // Append file if exists
      if (file) {
        formDataToSend.append('file', file);
      }

      const { data } = await registerUser(formDataToSend);
      localStorage.setItem('email', formData.email);
      navigate('/verify-code');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      console.error('Registration error:', err);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Logo isAuth />
        <Paper elevation={3} sx={{ p: 4, width: '100%', borderRadius: '8px' }}>
          <Typography variant="h4" gutterBottom>Register</Typography>
          {error && <Typography color="error">{error}</Typography>}
          <Box 
            component="form" 
            onSubmit={handleSubmit}
            sx={{ width: '100%' }}
          >
            <TextField
              label="First Name"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
            />
            <TextField
              label="Last Name"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
            />
            <TextField
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
              helperText="Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character"
            />
            <TextField
              label="Contact Number"
              name="contactNo"
              value={formData.contactNo}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
            />

            {/* File Upload Section */}
            <Box sx={{ mt: 2, mb: 2 }}>
              <Input
                type="file"
                id="file-upload"
                onChange={handleFileChange}
                sx={{ display: 'none' }}
                inputProps={{ accept: '.pdf,.doc,.docx' }}
              />
              <label htmlFor="file-upload">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<UploadFileIcon />}
                  fullWidth
                >
                  {file ? file.name : 'Upload CV (PDF/DOC/DOCX)'}
                </Button>
              </label>
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 3, mb: 2 }}
            >
              Register
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;