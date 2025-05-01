import { useRef, useState, useEffect } from "react";
import axios from "axios";

import { useNavigate } from "react-router-dom";
import {
    Box,
    Tabs,
    Tab,
    Typography,
    Container,
    Button,
    TextField,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
    Snackbar,
    Card,
    CardContent,
    
    Chip,
    Checkbox,
    AppBar,
    Toolbar,
} from "@mui/material";
import {
  Search as SearchIcon,
  CloudUpload as BulkUploadIcon,
  Calculate as CalculateScoresIcon,
  Description as JDIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";
import {
    searchUsers,
    searchCandidates,
    bulkUploadCandidates,
    calculateATS,
    extractJD,
} from "../services/api";
import Logo from '../components/Logo';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

    // Search Tab State
    const [searchKeyword, setSearchKeyword] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    
    // ATS Tab State
    const [selectedCandidates, setSelectedCandidates] = useState([]);
    const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
    const [candidateSearchResults, setCandidateSearchResults] = useState([]);

  // Bulk Upload Tab State
  const [selectedFile, setSelectedFile] = useState(null);

    // ATS Calculation Tab State
    const [jobDescription, setJobDescription] = useState("");
    const [atsResults, setAtsResults] = useState(null);
    const [matchedSkills, setMatchedSkills] = useState([]);
    const [additionalSkills, setAdditionalSkills] = useState([]);
    const [jdAnalysis, setJdAnalysis] = useState(null);
    const [extractedJD, setExtractedJD] = useState(null);
    const [newSkill, setNewSkill] = useState("");

    const navigate = useNavigate();
    const fileInputRef = useRef(null);


    // In your AdminDashboard.jsx
    useEffect(() => {
        const checkAdminAccess = () => {
            const token = localStorage.getItem("token");
            // If no token, redirect to login
            if (!token) {
                navigate("/login");
                return;
            }
            try {
                // Decode JWT to check user role
                const payload = JSON.parse(atob(token.split(".")[1]));
                if (payload.role !== "admin") {
                    // Not an admin - redirect to user dashboard
                    navigate("/dashboard");
                }
            } catch (err) {
                console.error("Failed to parse token for admin check:", err);
                navigate("/login");
            }
        };

    checkAdminAccess();
  }, [navigate]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

    const handleLogout = () => {
        localStorage.removeItem("token");
        sessionStorage.clear(); // Clear session storage
        localStorage.clear(); // ✅ Clears all local storage
        navigate("/login", { replace: true });
    };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const fetchAdminData = async () => {
    const token = localStorage.getItem("token");
    console.log("Stored Token:", token); // Debugging

    if (!token) {
      alert("No token found. Please log in again.");
      window.location.href = "/login";
      return;
    }

    try {
      const API_URL =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
      const response = await axios.get(`${API_URL}/admin-dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("Admin Data:", response.data);
    } catch (error) {
      console.error(
        "Error fetching admin data:",
        error.response?.data || error
      );
    }
  };

    // General Search Functionality (Search Tab)
    const handleSearch = async () => {
        if (!searchKeyword.trim()) {
            showSnackbar("Please enter a search term", "error");
            return;
        }

        setLoading(true);
        try {
            const { data } = await searchUsers(searchKeyword);
            setSearchResults(data.results || []);
            showSnackbar(`Found ${data.results.length} candidates`);
        } catch (error) {
            showSnackbar(error.response?.data?.message || "Search failed", "error");
        } finally {
            setLoading(false);
        }
    };

    // Candidate Search for ATS (ATS Tab)
    const handleCandidateSearch = async () => {
        if (!candidateSearchQuery.trim()) {
            showSnackbar("Please enter a search term", "error");
            return;
        }

        setLoading(true);
        try {
            const { data } = await searchCandidates(candidateSearchQuery);
            setCandidateSearchResults(data.candidates || []);
            showSnackbar(`Found ${data.candidates.length} candidates`);
        } catch (error) {
            showSnackbar(error.response?.data?.message || "Search failed", "error");
        } finally {
            setLoading(false);
        }
    };

  // Bulk Upload Functionality
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

    // Update your handleBulkUpload function
    const handleBulkUpload = async () => {
        if (!selectedFile) {
          showSnackbar("Please select a file", "error");
          return;
        }
      
        setLoading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
      
        try {
          const response = await bulkUploadCandidates(formData);
          const contentType = response.headers['content-type'];
      
          // 📄 If response is CSV (i.e., failed records exist)
          if (contentType.includes('text/csv')) {
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            const contentDisposition = response.headers['content-disposition'];
            const filename = contentDisposition 
              ? contentDisposition.split('filename=')[1].replace(/"/g, '')
              : `failed_records_${new Date().getTime()}.csv`;
      
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
      
            showSnackbar("Some records failed - CSV downloaded", "warning");
      
          } 
          // ✅ If response is JSON (i.e., all records succeeded or some failed but returned as JSON)
          else if (contentType.includes('application/json')) {
            const stats = response.data.stats;
            const success = stats?.success || 0;
            const failed = stats?.failed || 0;
            const total = stats?.total || 0;
      
            if (failed > 0) {
              showSnackbar(`${success} succeeded, ${failed} failed`, "warning");
            } else {
              showSnackbar("All records uploaded successfully!", "success");
            }
          }
      
        } catch (error) {
          console.error("Upload error:", error);
          showSnackbar(
            error.response?.data?.error || "Upload failed", 
            "error"
          );
        } finally {
          setLoading(false);
          setSelectedFile(null); // Clear from state
          if (fileInputRef.current) {
            fileInputRef.current.value = null; // Clear from UI
          }
      
        }
      };
      

  // Enhanced function to extract skills from job description
  const extractSkillsFromText = (text) => {
    // Core technical skills and requirements specific to D365 and ERP roles
    const skillPatterns = {
      dynamics: [
        "dynamics 365",
        "d365",
        "microsoft dynamics",
        "microsoft d365",
        "dynamics erp",
        "d365 erp",
      ],
      erp: ["erp", "enterprise resource planning"],
      certifications: ["certification", "certified"],
      compliance: [
        "gmp",
        "good manufacturing practices",
        "fda",
        "ema",
        "quality assurance",
        "quality control",
        "qc",
        "qa",
      ],
      industry: [
        "pharmaceutical",
        "biopharma",
        "life sciences",
        "manufacturing",
        "production",
      ],
      roles: [
        "super user",
        "power user",
        "system administrator",
        "business analyst",
        "technical lead",
      ],
    };

    const foundSkills = new Set();
    const lowerText = text.toLowerCase();

    // Function to check for whole word matches
    const checkWholeWord = (skill, text) => {
      const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedSkill}\\b`, "i");
      return regex.test(text);
    };

    // Extract skills from each category
    Object.values(skillPatterns).forEach((categorySkills) => {
      categorySkills.forEach((skill) => {
        if (checkWholeWord(skill, lowerText)) {
          // Format the skill appropriately
          let formattedSkill = skill;

          // Special formatting for common abbreviations
          if (skill.toLowerCase() === "gmp") {
            formattedSkill = "GMP";
          } else if (skill.toLowerCase() === "erp") {
            formattedSkill = "ERP";
          } else if (skill.toLowerCase().includes("d365")) {
            formattedSkill = "D365";
          } else if (skill.toLowerCase() === "fda") {
            formattedSkill = "FDA";
          } else if (skill.toLowerCase() === "ema") {
            formattedSkill = "EMA";
          } else if (skill.toLowerCase() === "qa") {
            formattedSkill = "QA";
          } else if (skill.toLowerCase() === "qc") {
            formattedSkill = "QC";
          } else {
            // Capitalize first letter of each word for other skills
            formattedSkill = skill
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
          }

          foundSkills.add(formattedSkill);
        }
      });
    });

    // Filter out common words and keep only relevant technical terms
    const relevantSkills = Array.from(foundSkills).filter((skill) => {
      const irrelevantTerms = [
        "a",
        "an",
        "the",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
      ];
      return !irrelevantTerms.includes(skill.toLowerCase());
    });

    return relevantSkills;
  };

    // Update job description change handler
    const handleJobDescriptionChange = (e) => {
        const newDescription = e.target.value;
        setJobDescription(newDescription);
        const extractedSkills = extractSkillsFromText(newDescription);
        setMatchedSkills(extractedSkills);
    };

    // Handle JD extraction
    const handleExtractJD = async () => {
        if (!jobDescription.trim()) {
            showSnackbar("Please enter a job description", "error");
            return;
        }

        setLoading(true);
        try {
            const { data } = await extractJD(jobDescription);
            if (data.success) {
                setExtractedJD(data.extractedData);
                setAdditionalSkills(data.extractedData.skills.map(s => s.name));
                showSnackbar("Successfully extracted job description information");
            } else {
                showSnackbar("Failed to extract job description", "error");
            }
        } catch (error) {
            console.error("JD extraction error:", error);
            showSnackbar(error.response?.data?.error || "Failed to extract job description", "error");
        } finally {
            setLoading(false);
        }
    };

    // Handle adding new skill
    const handleAddSkill = () => {
        if (!newSkill.trim()) {
            showSnackbar("Please enter a skill to add", "error");
            return;
        }
        setAdditionalSkills([...additionalSkills, newSkill.trim()]);
        setNewSkill("");
        showSnackbar("Skill added successfully");
    };

    // Handle removing skill
    const handleRemoveSkill = (skillToRemove) => {
        setAdditionalSkills(additionalSkills.filter(skill => skill !== skillToRemove));
    };

    // ATS Calculation Functionality
    const handleCalculateATS = async () => {
        if (!jobDescription.trim()) {
            showSnackbar("Job description is required", "error");
            return;
        }

        if (selectedCandidates.length === 0) {
            showSnackbar("Please select at least one candidate", "error");
            return;
        }

        setLoading(true);
        try {
            // Prepare the request data
            const requestData = {
                jobDescriptionText: jobDescription,
                selectedModIds: selectedCandidates,
                additionalSkills: additionalSkills
            };

            console.log('Sending ATS calculation request with:', requestData);

            const { data } = await calculateATS(requestData);

            console.log('ATS calculation response:', data);

            if (data.success) {
                setAtsResults(data.results);
                setJdAnalysis(data.jdAnalysis);
                showSnackbar("ATS scores calculated successfully");
            } else {
                const errorMsg = data.error || "Failed to calculate ATS scores";
                console.error('ATS calculation failed:', errorMsg);
                showSnackbar(errorMsg, "error");
            }
        } catch (error) {
            console.error("ATS calculation error:", error);
            let errorMessage = "ATS calculation failed";
            
            if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }

            showSnackbar(errorMessage, "error");
        } finally {
            setLoading(false);
        }
    };

  return (
    <>
      <AppBar 
        position="static" 
        sx={{ 
          bgcolor: '#2196F3',
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', padding: '0 24px' }}>
          <Logo />
          <Button 
            color="inherit" 
            onClick={handleLogout} 
            startIcon={<LogoutIcon />}
            sx={{
              textTransform: 'uppercase',
              fontWeight: 500
            }}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Admin Dashboard
        </Typography>

        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Candidate Search" icon={<SearchIcon />} />
            <Tab label="ATS Scoring" icon={<CalculateScoresIcon />} />
            <Tab label="Bulk Upload" icon={<BulkUploadIcon />} />
          </Tabs>
        </Box>

        {/* Search Tab */}
        {activeTab === 0 && (
            <Box>
                <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        label="Search candidates by skills, experience, or education"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSearch}
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
                    >
                        Search
                    </Button>
                </Box>

                {searchResults.length > 0 ? (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedCandidates(searchResults.map(user => user.modId));
                                                } else {
                                                    setSelectedCandidates([]);
                                                }
                                            }}
                                            checked={selectedCandidates.length === searchResults.length}
                                            indeterminate={selectedCandidates.length > 0 && selectedCandidates.length < searchResults.length}
                                        />
                                    </TableCell>
                                    <TableCell>MOD_ID</TableCell>
                                    <TableCell>Email</TableCell>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Skills</TableCell>
                                    <TableCell>Experience</TableCell>
                                    <TableCell>Education</TableCell>
                                    <TableCell>CV_URL</TableCell>
                                    <TableCell>Description</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {searchResults.map((user, index) => (
                                    <TableRow key={index}>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={selectedCandidates.includes(user.modId)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedCandidates([...selectedCandidates, user.modId]);
                                                    } else {
                                                        setSelectedCandidates(selectedCandidates.filter(id => id !== user.modId));
                                                    }
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {user.modId || "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            {user.personalInformation?.email || "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            {user.personalInformation?.firstName || "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            <div style={{
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                padding: '12px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {user.skills?.join(", ")}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div style={{
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                padding: '12px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {user.workExperience?.map((exp, i) => (
                                                    <div key={i}>
                                                        <b>{exp.jobTitle}</b> at {exp.companyName}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div style={{
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                padding: '10px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {user.Qualification?.map((edu, i) => (
                                                    <div key={i}>
                                                        <b>{edu.Degree}</b> from {edu.UniversityName}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {user.CV_URL ? (
                                                <a
                                                    href={user.CV_URL}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: '#1976d2', textDecoration: 'underline' }}
                                                >
                                                    View CV
                                                </a>
                                            ) : "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            <div style={{
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                padding: '10px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {user.about?.description}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Typography variant="body1" sx={{ mt: 2 }}>
                        {loading ? "Searching..." : "No results found"}
                    </Typography>
                )}
            </Box>
        )}

        {/* ATS Scoring Tab */}
        {activeTab === 1 && (
            <Box>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {/* Candidate Search Section */}
                    <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
                        <TextField
                            fullWidth
                            variant="outlined"
                            label="Search candidates for ATS scoring"
                            value={candidateSearchQuery}
                            onChange={(e) => setCandidateSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleCandidateSearch()}
                        />
                        <Button
                            variant="contained"
                            onClick={handleCandidateSearch}
                            disabled={loading}
                            startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
                        >
                            Search Candidates
                        </Button>
                    </Box>

                    {/* Candidate Search Results */}
                    {candidateSearchResults.length > 0 && (
                        <TableContainer component={Paper} sx={{ mb: 3 }}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedCandidates(candidateSearchResults.map(user => user.modId));
                                                    } else {
                                                        setSelectedCandidates([]);
                                                    }
                                                }}
                                                checked={selectedCandidates.length === candidateSearchResults.length}
                                                indeterminate={selectedCandidates.length > 0 && selectedCandidates.length < candidateSearchResults.length}
                                            />
                                        </TableCell>
                                        <TableCell>MOD ID</TableCell>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Skills</TableCell>
                                        <TableCell>Experience</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {candidateSearchResults.map((user) => (
                                        <TableRow key={user.modId}>
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    checked={selectedCandidates.includes(user.modId)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedCandidates([...selectedCandidates, user.modId]);
                                                        } else {
                                                            setSelectedCandidates(selectedCandidates.filter(id => id !== user.modId));
                                                        }
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>{user.modId}</TableCell>
                                            <TableCell>{user.name}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                                    {user.skills.map((skill, idx) => (
                                                        <Chip
                                                            key={idx}
                                                            label={skill}
                                                            size="small"
                                                            color="primary"
                                                            variant="outlined"
                                                        />
                                                    ))}
                                                </Box>
                                            </TableCell>
                                            <TableCell>{user.experience}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Job Description Section */}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <TextField
                            fullWidth
                            multiline
                            rows={6}
                            variant="outlined"
                            label="Enter Job Description"
                            value={jobDescription}
                            onChange={handleJobDescriptionChange}
                        />
                        <Button
                            variant="contained"
                            onClick={handleExtractJD}
                            disabled={loading || !jobDescription.trim()}
                            startIcon={loading ? <CircularProgress size={20} /> : <JDIcon />}
                        >
                            Extract Job Description
                        </Button>
                    </Box>

                    {/* Extracted JD Info */}
                    {extractedJD && (
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Extracted Information
                                </Typography>
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <Box>
                                        <Typography variant="subtitle1" gutterBottom>
                                            Required Skills:
                                        </Typography>
                                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                                            {additionalSkills.map((skill, index) => (
                                                <Chip
                                                    key={index}
                                                    label={skill}
                                                    onDelete={() => handleRemoveSkill(skill)}
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                            ))}
                                        </Box>
                                    </Box>

                                    {/* Add New Skill */}
                                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                                        <TextField
                                            size="small"
                                            label="Add Skill"
                                            value={newSkill}
                                            onChange={(e) => setNewSkill(e.target.value)}
                                            onKeyPress={(e) => e.key === "Enter" && handleAddSkill()}
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={handleAddSkill}
                                            disabled={!newSkill.trim()}
                                        >
                                            Add Skill
                                        </Button>
                                    </Box>

                                    <Typography>
                                        Required Experience: {extractedJD.yearsOfExperience} years
                                    </Typography>
                                    <Typography>
                                        Required Education: {extractedJD.education}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    )}

                    <Button
                        variant="contained"
                        onClick={handleCalculateATS}
                        disabled={loading || !jobDescription.trim() || selectedCandidates.length === 0}
                        startIcon={loading ? <CircularProgress size={20} /> : <CalculateScoresIcon />}
                    >
                        Calculate ATS Scores
                    </Button>

                    {/* JD Analysis Section */}
                    {jdAnalysis && (
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Job Description Analysis
                                </Typography>
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                                    <Typography variant="subtitle1">Required Skills:</Typography>
                                    {jdAnalysis.combinedSkills.map((skill, index) => (
                                        <Chip key={index} label={skill} color="primary" variant="outlined" />
                                    ))}
                                </Box>
                                <Typography>
                                    Required Experience: {jdAnalysis.yearsOfExperience} years
                                </Typography>
                                <Typography>
                                    Required Education: {jdAnalysis.education}
                                </Typography>
                            </CardContent>
                        </Card>
                    )}

                    {/* ATS Results Section */}
                    {atsResults && (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>MOD ID</TableCell>
                                        <TableCell>ATS Score</TableCell>
                                        <TableCell>Matched Skills</TableCell>
                                        <TableCell>AI Feedback</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {atsResults.map((result) => (
                                        <TableRow key={result.modId}>
                                            <TableCell>{result.modId}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <CircularProgress
                                                        variant="determinate"
                                                        value={result.atsScore}
                                                        color={result.atsScore >= 70 ? "success" : result.atsScore >= 50 ? "warning" : "error"}
                                                    />
                                                    <Typography>{Math.round(result.atsScore)}%</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                                    {result.matchedSkills.map((skill, idx) => (
                                                        <Chip
                                                            key={idx}
                                                            label={skill}
                                                            size="small"
                                                            color="primary"
                                                            variant="outlined"
                                                        />
                                                    ))}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        maxHeight: '150px',
                                                        overflowY: 'auto',
                                                        whiteSpace: 'pre-wrap'
                                                    }}
                                                >
                                                    {result.aiFeedback}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Box>
        )}

        {/* Bulk Upload Tab */}
        {activeTab === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Bulk Upload Candidates
            </Typography>
            <Typography paragraph>
              Upload a CSV file with MOD_ID and CV_URL columns to process multiple
              candidates.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 3 }}>
              <Button
                variant="contained"
                component="label"
                startIcon={<BulkUploadIcon />}
              >
                Select CSV File
                <input
                  type="file"
                  hidden
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </Button>
              <Typography>
                {selectedFile ? selectedFile.name : "No file selected"}
              </Typography>
            </Box>

            {selectedFile && (
              <Button
                variant="contained"
                color="primary"
                onClick={handleBulkUpload}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : null}
              >
                {loading ? "Processing..." : "Upload and Process"}
              </Button>
            )}
          </Box>
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar({ ...snackbar, open: false })}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
    </>
  );
};
export default AdminDashboard;
