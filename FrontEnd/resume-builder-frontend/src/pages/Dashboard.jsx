// Final Dashboard.jsx — Fully Fixed with Section States + Save Buttons

import React, { useEffect, useState } from 'react';
import {
  Box, Button, Container, Grid, TextField, Typography, Snackbar, Alert, Chip, Tooltip, Tabs, Tab, Link, CircularProgress, AppBar, Toolbar,
  Paper, Divider, IconButton
} from '@mui/material';
import {
  Download as DownloadIcon,
  Add as AddIcon,
  Logout as LogoutIcon,
  Save as SaveIcon,
  School as SchoolIcon,
  Work as WorkIcon,
  Code as CodeIcon,
  Badge as BadgeIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';

import {
  getUserById,
  updatePersonalInfo,
  updateAbout,
  updateSkills,
  updateWorkExperience,
  updateProjectExperience,
  updateMicrosoftCertificates,
  updateQualifications,
  generateResumePDF
} from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();

  const [personalInfo, setPersonalInfo] = useState({ firstName: '', lastName: '', email: '', contactNo: '', city: '', state: '', country: '' });
  const [about, setAbout] = useState({ description: '', linkedInURL: '', professionalTitle: '', primaryRole: '', yearsOfExperience: '' });
  const [skills, setSkills] = useState('');
  const [qualification, setQualification] = useState([]);
  const [workExperience, setWorkExperience] = useState([]);
  const [projectExperience, setProjectExperience] = useState([]);
  const [microsoftCertificates, setMicrosoftCertificates] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('edit');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (!token || !userStr) {
          navigate('/login');
          return;
        }

        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          navigate('/admin-dashboard');
          return;
        }

        setUserId(user._id);

        const response = await getUserById(user._id);
        if (response?.user) {
          const u = response.user;
          setPersonalInfo(u.personalInformation || {});
          setAbout(u.about || {});
          setSkills(u.skills ? u.skills.join(', ') : '');
          setQualification(u.Qualification || []);
          setWorkExperience(u.workExperience || []);
          setProjectExperience(u.projectExperience || []);
          setMicrosoftCertificates(u.MicrosoftCertificates || []);
        }
      } catch (error) {
        console.error(error);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const handleSave = async (section) => {
    try {
      setIsSaving(true);
      let response;
      switch (section) {
        case 'personalInformation':
          response = await updatePersonalInfo({ personalInformation: personalInfo });
          break;
        case 'about':
          response = await updateAbout({ about });
          break;
        case 'Qualification':
          response = await updateQualifications({ Qualification: qualification });
          break;
        case 'workExperience':
          response = await updateWorkExperience({ workExperience });
          break;
        case 'projectExperience':
          response = await updateProjectExperience({ projectExperience });
          break;
        case 'MicrosoftCertificates':
          response = await updateMicrosoftCertificates({ MicrosoftCertificates: microsoftCertificates });
          break;
        default:
          throw new Error('Invalid section');
      }
      showSnackbar('Saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      showSnackbar('Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSkills = async () => {
    try {
      setIsSaving(true);
      const skillsArray = skills.split(',').map(skill => skill.trim()).filter(skill => skill);
      
      console.log('[Frontend] Saving skills:', skillsArray);
      
      const response = await updateSkills({ skills: skillsArray });
      
      if (response?.data?.user?.skills) {
        setSkills(response.data.user.skills.join(', '));
        showSnackbar('Skills updated successfully!', 'success');
      } else {
        throw new Error('Failed to save skills');
      }
    } catch (err) {
      console.error('Error saving skills:', err);
      showSnackbar('Failed to save skills', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArrayFieldChange = (listSetter, list, index, field, value) => {
    const newList = [...list];
    newList[index][field] = value;
    listSetter(newList);
  };

  const addArrayEntry = (listSetter, list, template) => {
    listSetter([...list, template]);
  };

  const removeArrayEntry = (listSetter, list, index) => {
    const newList = list.filter((_, i) => i !== index);
    listSetter(newList);
  };

  const handleDownloadCV = async () => {
    try {
      // Check if userId is available
      if (!userId) {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
          showSnackbar('User not authenticated', 'error');
          return;
        }
        const user = JSON.parse(userStr);
        if (!user._id) {
          showSnackbar('User ID not found', 'error');
          return;
        }
        setUserId(user._id);
      }

      setIsDownloading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/generate-cv/${userId || JSON.parse(localStorage.getItem('user'))._id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate CV');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;
      link.download = `LiveD365_Resume_${new Date().toISOString().split('T')[0]}.pdf`; // Set filename with date

      // Append to document, click, and cleanup
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url); // Clean up the URL object

      showSnackbar('CV downloaded successfully!', 'success');
    } catch (error) {
      console.error('Error downloading CV:', error);
      showSnackbar(error.message || 'Failed to download CV', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) return <Container><Box height="100vh" display="flex" justifyContent="center" alignItems="center"><CircularProgress /></Box></Container>;
  if (error) return <Container><Typography>{error}</Typography></Container>;

  return (
    <>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: '#2196F3',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)'
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', padding: '0 24px' }}>
          <Logo />
          <Box>
            <Button
              color="inherit"
              onClick={handleDownloadCV}
              startIcon={<DownloadIcon />}
              disabled={isDownloading}
              sx={{
                marginRight: 2,
                textTransform: 'none',
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              }}
            >
              {isDownloading ? 'Downloading...' : 'Download CV'}
            </Button>
            <Button
              color="inherit"
              onClick={handleLogout}
              startIcon={<LogoutIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          sx={{
            mb: 3,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '1rem'
            }
          }}
        >
          <Tab label="Edit Resume" value="edit" />
          <Tab label="Preview" value="preview" />
        </Tabs>

        {activeTab === 'edit' ? (
          <Grid container spacing={3}>
            {/* Personal Info Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 500, color: '#1976d2' }}>
                  Personal Information
                </Typography>
                <Grid container spacing={2} mt={1}>
                  {['firstName', 'lastName', 'email', 'contactNo', 'city', 'state', 'country'].map((field) => (
                    <Grid item xs={12} sm={6} key={field}>
                      <TextField
                        fullWidth
                        label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                        value={personalInfo[field] || ''}
                        onChange={(e) => setPersonalInfo(p => ({ ...p, [field]: e.target.value }))}
                        variant="outlined"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
                      />
                    </Grid>
                  ))}
                </Grid>
                <Button
                  variant="contained"
                  onClick={() => handleSave('personalInformation')}
                  startIcon={<SaveIcon />}
                  sx={{ mt: 3, textTransform: 'none', borderRadius: 1 }}
                >
                  Save Personal Info
                </Button>
              </Paper>
            </Grid>

            {/* About Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 500, color: '#1976d2' }}>
                  Professional Summary
                </Typography>
                <Grid container spacing={2}>
                  {['description', 'linkedInURL', 'professionalTitle', 'primaryRole', 'yearsOfExperience'].map((field) => (
                    <Grid item xs={12} key={field}>
                      <TextField
                        fullWidth
                        label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                        value={about[field] || ''}
                        onChange={(e) => setAbout(a => ({ ...a, [field]: e.target.value }))}
                        multiline={field === 'description'}
                        rows={field === 'description' ? 4 : 1}
                        variant="outlined"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
                      />
                    </Grid>
                  ))}
                </Grid>
                <Button
                  variant="contained"
                  onClick={() => handleSave('about')}
                  startIcon={<SaveIcon />}
                  sx={{ mt: 3, textTransform: 'none', borderRadius: 1 }}
                >
                  Save Summary
                </Button>
              </Paper>
            </Grid>

            {/* Skills Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 500, color: '#1976d2' }}>
                  Skills
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Enter your skills separated by commas (e.g., JavaScript, React, Node.js)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  variant="outlined"
                  sx={{ mb: 2 }}
                  placeholder="Enter your skills, separated by commas"
                />
                <Button
                  variant="contained"
                  onClick={handleSaveSkills}
                  disabled={isSaving}
                  startIcon={<SaveIcon />}
                  sx={{ textTransform: 'none', borderRadius: 1 }}
                >
                  {isSaving ? 'Saving...' : 'Save Skills'}
                </Button>
              </Paper>
            </Grid>

            {/* Education Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SchoolIcon sx={{ mr: 1, color: '#1976d2' }} />
                  <Typography variant="h5" sx={{ fontWeight: 500, color: '#1976d2' }}>
                    Education
                  </Typography>
                </Box>
                <DynamicArraySection
                  title="Education"
                  list={qualification}
                  setList={setQualification}
                  fields={['UniversityName', 'Degree', 'Field_of_study', 'Start_month_year', 'End_month_year', 'description']}
                  template={{}}
                  save={() => handleSave('Qualification')}
                />
              </Paper>
            </Grid>

            {/* Work Experience Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <WorkIcon sx={{ mr: 1, color: '#1976d2' }} />
                  <Typography variant="h5" sx={{ fontWeight: 500, color: '#1976d2' }}>
                    Work Experience
                  </Typography>
                </Box>
                <DynamicArraySection
                  title="Work Experience"
                  list={workExperience}
                  setList={setWorkExperience}
                  fields={['companyName', 'industryType', 'location', 'startDate', 'endDate', 'description']}
                  template={{}}
                  save={() => handleSave('workExperience')}
                />
              </Paper>
            </Grid>

            {/* Projects Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CodeIcon sx={{ mr: 1, color: '#1976d2' }} />
                  <Typography variant="h5" sx={{ fontWeight: 500, color: '#1976d2' }}>
                    Projects
                  </Typography>
                </Box>
                <DynamicArraySection
                  title="Projects"
                  list={projectExperience}
                  setList={setProjectExperience}
                  fields={['projectName', 'jobTitle', 'startDate', 'endDate', 'technologiesUsed', 'description']}
                  template={{}}
                  save={() => handleSave('projectExperience')}
                />
              </Paper>
            </Grid>

            {/* Microsoft Certificates Section */}
            <Grid item xs={12}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #e0e0e0',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <BadgeIcon sx={{ mr: 1, color: '#1976d2' }} />
                  <Typography variant="h5" sx={{ fontWeight: 500, color: '#1976d2' }}>
                    Microsoft Certifications
                  </Typography>
                </Box>
                <DynamicArraySection
                  title="Microsoft Certifications"
                  list={microsoftCertificates}
                  setList={setMicrosoftCertificates}
                  fields={['CertificateName', 'DateEarned', 'ValidityDate', 'certificateURL', 'description']}
                  template={{}}
                  save={() => handleSave('MicrosoftCertificates')}
                />
              </Paper>
            </Grid>
          </Grid>
        ) : (
          <PreviewSection {...{ personalInfo, about, skills: skills.split(',').map(s => s.trim()).filter(s => s), qualification, workExperience, projectExperience, microsoftCertificates }} />
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
    </>
  );
};

// Update DynamicArraySection component
const DynamicArraySection = ({ title, list, setList, fields, template, save }) => (
  <Box>
    {list.map((entry, i) => (
      <Paper
        key={i}
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          border: '1px solid #e0e0e0',
          borderRadius: 1
        }}
      >
        <Grid container spacing={2}>
          {fields.map(field => (
            <Grid item xs={12} sm={6} key={field}>
              <TextField
                fullWidth
                label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z_])/g, ' $1').trim()}
                value={entry[field] || ''}
                onChange={(e) => setList(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: e.target.value } : item))}
                variant="outlined"
                multiline={field === 'description'}
                rows={field === 'description' ? 4 : 1}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />
            </Grid>
          ))}
          <Grid item xs={12}>
            <Button
              color="error"
              variant="outlined"
              onClick={() => setList(list.filter((_, idx) => idx !== i))}
              sx={{
                textTransform: 'none',
                borderRadius: 1,
                borderColor: '#ff1744',
                color: '#ff1744',
                '&:hover': {
                  borderColor: '#d50000',
                  backgroundColor: 'rgba(255, 23, 68, 0.04)'
                }
              }}
            >
              Remove {title}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    ))}
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setList([...list, template])}
        sx={{
          textTransform: 'none',
          borderRadius: 1,
          borderColor: '#1976d2',
          color: '#1976d2',
          '&:hover': {
            borderColor: '#1565c0',
            backgroundColor: 'rgba(25, 118, 210, 0.04)'
          }
        }}
      >
        Add {title}
      </Button>
      <Button
        variant="contained"
        onClick={save}
        startIcon={<SaveIcon />}
        sx={{
          textTransform: 'none',
          borderRadius: 1
        }}
      >
        Save {title}
      </Button>
    </Box>
  </Box>
);

const PreviewSection = ({ personalInfo = {}, about = {}, skills = [], qualification = [], workExperience = [], projectExperience = [], microsoftCertificates = [] }) => (
  <Box sx={{ p: 3, backgroundColor: '#f5f5f5', borderRadius: 2 }}>
    {/* Personal Information */}
    <Box mb={4}>
      <Typography variant="h4" gutterBottom>
        {personalInfo?.firstName || ''} {personalInfo?.lastName || ''}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary">
        {personalInfo?.email && personalInfo?.contactNo ? `${personalInfo.email} | ${personalInfo.contactNo}` : personalInfo?.email || personalInfo?.contactNo || ''}
      </Typography>
      <Typography variant="body1" gutterBottom>
        {[personalInfo?.city, personalInfo?.state, personalInfo?.country].filter(Boolean).join(', ')}
      </Typography>
    </Box>

    {/* About Section */}
    {about?.description && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>About</Typography>
        <Typography variant="body1" paragraph>{about.description}</Typography>
        {about?.linkedInURL && (
          <Link href={about.linkedInURL} target="_blank" rel="noopener">
            LinkedIn Profile
          </Link>
        )}
        {about?.professionalTitle && (
          <Typography variant="body1">
            {[about.professionalTitle, about.primaryRole, about.yearsOfExperience ? `${about.yearsOfExperience} Years Experience` : null]
              .filter(Boolean)
              .join(' • ')}
          </Typography>
        )}
      </Box>
    )}

    {/* Skills Section */}
    {skills.length > 0 && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>Skills</Typography>
        <Box display="flex" flexWrap="wrap" gap={1}>
          {skills.map((skill, idx) => (
            <Chip 
              key={idx} 
              label={skill} 
              color="primary" 
              variant="outlined"
              sx={{ borderRadius: 1 }}
            />
          ))}
        </Box>
      </Box>
    )}

    {/* Work Experience Section */}
    {Array.isArray(workExperience) && workExperience.length > 0 && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>Work Experience</Typography>
        {workExperience.map((work, idx) => (
          <Box key={idx} mb={2}>
            <Typography variant="h6">{work?.companyName || ''}</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {[work?.industryType, work?.location].filter(Boolean).join(' • ')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {work?.startDate && work?.endDate ? `${work.startDate} - ${work.endDate}` : ''}
            </Typography>
            {work?.description && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                {work.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    )}

    {/* Project Experience Section */}
    {Array.isArray(projectExperience) && projectExperience.length > 0 && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>Projects</Typography>
        {projectExperience.map((project, idx) => (
          <Box key={idx} mb={2}>
            <Typography variant="h6">{project?.projectName || ''}</Typography>
            <Typography variant="subtitle1">{project?.jobTitle || ''}</Typography>
            <Typography variant="body2" color="text.secondary">
              {project?.startDate && project?.endDate ? `${project.startDate} - ${project.endDate}` : ''}
            </Typography>
            {project?.technologiesUsed && typeof project.technologiesUsed === 'string' && (
              <Box display="flex" flexWrap="wrap" gap={0.5} my={1}>
                {project.technologiesUsed.split(',').map((tech, i) => (
                  <Chip key={i} label={tech.trim()} size="small" variant="outlined" />
                ))}
              </Box>
            )}
            {project?.description && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                {project.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    )}

    {/* Education/Qualification Section */}
    {Array.isArray(qualification) && qualification.length > 0 && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>Education</Typography>
        {qualification.map((edu, idx) => (
          <Box key={idx} mb={2}>
            <Typography variant="h6">{edu?.Degree || ''}</Typography>
            <Typography variant="subtitle1">
              {[edu?.UniversityName, edu?.Field_of_study].filter(Boolean).join(' • ')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {edu?.Start_month_year && edu?.End_month_year ? `${edu.Start_month_year} - ${edu.End_month_year}` : ''}
            </Typography>
            {edu?.description && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                {edu.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    )}

    {/* Microsoft Certificates Section */}
    {Array.isArray(microsoftCertificates) && microsoftCertificates.length > 0 && (
      <Box mb={4}>
        <Typography variant="h5" gutterBottom>Microsoft Certifications</Typography>
        {microsoftCertificates.map((cert, idx) => (
          <Box key={idx} mb={2}>
            <Typography variant="h6">{cert?.CertificateName || ''}</Typography>
            <Typography variant="body2" color="text.secondary">
              {cert?.DateEarned && `Earned: ${cert.DateEarned}`}
              {cert?.ValidityDate && ` • Valid until: ${cert.ValidityDate}`}
            </Typography>
            {cert?.certificateURL && (
              <Link href={cert.certificateURL} target="_blank" rel="noopener" sx={{ display: 'block', mt: 0.5 }}>
                View Certificate
              </Link>
            )}
            {cert?.description && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                {cert.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    )}
  </Box>
);

export default Dashboard;

