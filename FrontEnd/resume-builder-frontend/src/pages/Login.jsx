import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/api';
import { TextField, Button, Container, Typography, Box, Link as MuiLink, Paper } from '@mui/material';
import Logo from '../components/Logo';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       const { data } = await loginUser(formData);
//       localStorage.setItem('token', data.token);
//       localStorage.setItem('user', JSON.stringify(data.user));

//       // Redirect based on user role
//       navigate(data.user.role === 'admin' ? '/admin-dashboard' : '/dashboard');
//     } catch (err) {
//       console.error("Login Error:", err); // Debugging
//       setError(err.response?.data?.error || 'Login failed');
//     }
//   };

const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser(formData);
      console.log("Full API Response:", data);

      if (data && data.user) {
        // Store token and user data
        localStorage.setItem("token", data.user.token);
        localStorage.setItem("user", JSON.stringify({
          _id: data.user.id, // Make sure we use _id instead of id
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          role: data.user.role
        }));
        console.log("Token stored in localStorage:", data.user.token);
        console.log("User data stored:", localStorage.getItem("user"));

        // Clear any existing errors
        setError('');

        // Redirect based on user role
        if (data.user.role === 'admin') {
          navigate('/admin-dashboard');
        } else {
          navigate('/dashboard');
        }
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      console.error("Login Error:", err);
      setError(err.message || err.response?.data?.error || "Login failed");
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
          <Typography variant="h4" gutterBottom>Login</Typography>
          {error && <Typography color="error">{error}</Typography>}
          <form onSubmit={handleSubmit}>
            <TextField label="Email" type="email" name="email" value={formData.email} onChange={handleChange} fullWidth margin="normal" required />
            <TextField label="Password" type="password" name="password" value={formData.password} onChange={handleChange} fullWidth margin="normal" required />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 3 }}>Login</Button>
          </form>
          <Typography sx={{ mt: 2 }}>
            Don't have an account? <Button onClick={() => navigate('/register')}>Register</Button>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;
