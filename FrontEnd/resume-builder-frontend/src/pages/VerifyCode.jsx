import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyCode } from '../services/api';
import { TextField, Button, Container, Typography, Box, Paper } from '@mui/material';
import Logo from '../components/Logo';

const VerifyCode = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const storedEmail = localStorage.getItem('email');
    if (!storedEmail) navigate('/register');
    setEmail(storedEmail);
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await verifyCode(email, code);
      // Store token and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Navigate based on role
      if (data.user.role === 'admin') {
        navigate('/admin-dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
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
          <Typography variant="h4" gutterBottom>Verify Your Email</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            We've sent a verification code to {email}
          </Typography>
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              label="Verification Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              fullWidth
              margin="normal"
              required
              inputProps={{ maxLength: 4 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 3, mb: 2 }}
            >
              Verify
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyCode;