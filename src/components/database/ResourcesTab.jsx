import { memo, useCallback, useDeferredValue, useState, useMemo, useRef, useEffect } from "react";
import {
    Box, Button, Typography, Paper, Grid, TextField, MenuItem, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton,
    InputAdornment, Drawer, Pagination, Divider, alpha, useTheme, InputBase,
    Dialog, DialogTitle, DialogContent, DialogActions, Chip
} from "@mui/material";
// Icons
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HistoryIcon from '@mui/icons-material/History';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { useSettings } from "../../context/SettingsContext";

// 🔥 UPGRADED HIGH-PERFORMANCE "GHOST" INPUT CELL
const RateInputCell = memo(({ resource, regionName, onSave, ghostInputStyle }) => {
    const [localVal, setLocalVal] = useState(resource.rates[regionName] || "");

    useEffect(() => {
        setLocalVal(resource.rates[regionName] || "");
    }, [resource.rates, regionName]);

    const handleBlur = () => {
        const numVal = Number(localVal);
        const currentDbVal = Number(resource.rates[regionName] || 0);
        if (numVal !== currentDbVal) {
            onSave(resource.id, numVal);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.target.blur();
    };

    return (
        <InputBase
            type="number"
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            sx={ghostInputStyle}
        />
    );
});

export default function ResourcesTab({ regions, resources, loadData }) {
    const theme = useTheme();
    const { formatCurrency } = useSettings();
    const fileInputRef = useRef(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [importRegion, setImportRegion] = useState("");
    const [newRegion, setNewRegion] = useState("");

    const [resCode, setResCode] = useState("");
    const [resDesc, setResDesc] = useState("");
    const [resUnit, setResUnit] = useState("nos");

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const [selectedResource, setSelectedResource] = useState(null);
    const [brandModalOpen, setBrandModalOpen] = useState(false);
    const [brandModalResource, setBrandModalResource] = useState(null);
    const [tempBrandRates, setTempBrandRates] = useState([]);
    const [selectedMonthYear, setSelectedMonthYear] = useState("");
    // Brand chart states
    const [brandChartOpen, setBrandChartOpen] = useState(false);
    const [brandChartResource, setBrandChartResource] = useState(null);
    const [brandChartMonthYear, setBrandChartMonthYear] = useState("");
    const deferredSearchTerm = useDeferredValue(searchTerm);

    // Helper: current month key e.g. "2026-07"
    const getCurrentMonthKey = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const filteredResources = useMemo(() => {
        const normalizedSearch = deferredSearchTerm.toLowerCase();
        return resources.filter(r =>
            (r.code || "").toLowerCase().includes(normalizedSearch) ||
            (r.description || "").toLowerCase().includes(normalizedSearch)
        );
    }, [resources, deferredSearchTerm]);

    const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
    const paginatedResources = useMemo(() => (
        filteredResources.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    ), [filteredResources, currentPage]);

    // --- LOGIC HANDLERS (Unchanged) ---
    const updateResourceRate = useCallback(async (id, field, value, regionName = null) => {
        const res = resources.find(r => r.id === id);
        if (field === 'rates' && regionName) {
            const currentHistory = Array.isArray(res.rateHistory) ? res.rateHistory : [];
            const updatedHistory = [
                ...currentHistory,
                { date: new Date().toISOString().split('T')[0], rate: value[regionName], region: regionName }
            ];
            await window.api.db.updateResource(id, 'rates', JSON.stringify(value));
            await window.api.db.updateResource(id, 'rateHistory', JSON.stringify(updatedHistory));
        } else {
            await window.api.db.updateResource(id, field, value);
        }
        loadData();
    }, [loadData, resources]);

    const deleteResource = useCallback(async (id) => {
        if (window.confirm("CRITICAL: Delete this resource? This will break formulas in BOQs that rely on it.")) {
            await window.api.db.deleteResource(id);
            loadData();
        }
        
    }, [loadData]);

    const handleDeleteRegion = useCallback(async (id) => {
        if (window.confirm("WARNING: Delete this region? All historical prices saved under this region will become orphaned.")) {
            await window.api.db.deleteRegion(id);
            loadData();
        }
    }, [loadData]);

    const handleOpenBrandModal = useCallback((res) => {
        setBrandModalResource(res);
        const ratesObj = res.rates || {};
        const history = (ratesObj.brandRatesHistory && typeof ratesObj.brandRatesHistory === 'object')
            ? ratesObj.brandRatesHistory
            : {};
        const currentKey = getCurrentMonthKey();
        const currentMonthData = Array.isArray(history[currentKey]) ? history[currentKey] : [];
        setSelectedMonthYear(currentKey);
        setTempBrandRates(JSON.parse(JSON.stringify(currentMonthData)));
        setBrandModalOpen(true);
    }, []);

    const handleOpenBrandChart = useCallback((res) => {
        setBrandChartResource(res);
        setBrandChartMonthYear(getCurrentMonthKey());
        setBrandChartOpen(true);
    }, []);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !importRegion) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target.result;
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const rawSheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                let headerRowIdx = -1;
                for (let i = 0; i < Math.min(10, rawSheetData.length); i++) {
                    const row = rawSheetData[i];
                    if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('code'))) {
                        headerRowIdx = i; break;
                    }
                }

                if (headerRowIdx === -1) return alert("Upload Failed: Could not find a header row containing 'Code'.");

                const headers = rawSheetData[headerRowIdx].map(h => typeof h === 'string' ? h.toLowerCase().trim() : '');
                const codeIdx = headers.findIndex(h => h === 'code' || h.includes('code'));
                const descIdx = headers.findIndex(h => h.includes('description') || h.includes('item'));
                const unitIdx = headers.findIndex(h => h === 'unit' || h.includes('unit'));
                const rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('price'));

                if (codeIdx === -1 || descIdx === -1 || rateIdx === -1) {
                    return alert("Missing required columns. Ensure your file has 'Code', 'Description', and 'Rate' headers.");
                }

                const formattedData = [];
                for (let i = headerRowIdx + 1; i < rawSheetData.length; i++) {
                    const row = rawSheetData[i];
                    if (!row || row.length === 0) continue;

                    const code = String(row[codeIdx] || '').trim();
                    const desc = String(row[descIdx] || '').trim();
                    const unit = String(row[unitIdx] || 'nos').trim();
                    const rate = Number(row[rateIdx] || 0);

                    if (code && desc) formattedData.push({ code, description: desc, unit, rate });
                }

                if (formattedData.length === 0) return alert("No valid material rows found under the headers.");

                for (const item of formattedData) {
                    let existingRes = resources.find(r => r.code === item.code);
                    if (existingRes) {
                        const newRates = { ...existingRes.rates, [importRegion]: item.rate };
                        await updateResourceRate(existingRes.id, 'rates', newRates, importRegion);
                    } else {
                        await window.api.db.createResource({
                            code: item.code, description: item.description, unit: item.unit,
                            rates: JSON.stringify({ [importRegion]: item.rate }),
                            rateHistory: JSON.stringify([{ date: new Date().toISOString().split('T')[0], rate: item.rate, region: importRegion }])
                        });
                    }
                }
                alert(`Successfully imported ${formattedData.length} items into the [${importRegion}] market!`);
                loadData();
            } catch (err) {
                console.error("Import Error:", err);
                alert("Failed to parse Excel file. Is the file corrupted?");
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- STYLES FOR GHOST INPUTS ---
    const ghostInputStyle = useMemo(() => ({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
        color: 'text.primary',
        width: '100%',
        padding: '2px 8px',
        borderRadius: '6px',
        transition: 'all 0.2s ease',
        border: '1px solid transparent',
        '&:hover': {
            bgcolor: alpha(theme.palette.common.white, 0.05),
            borderColor: alpha(theme.palette.common.white, 0.1)
        },
        '&.Mui-focused': {
            bgcolor: alpha(theme.palette.background.default, 0.8),
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
        }
    }), [theme]);

    const InflationDrawer = () => {
        if (!selectedResource) return null;
        const history = (selectedResource.rateHistory || []).sort((a, b) => new Date(a.date) - new Date(b.date));
        const latest = history.length > 0 ? history[history.length - 1].rate : 0;
        const oldest = history.length > 0 ? history[0].rate : 0;
        const trend = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;

        return (
            <Drawer anchor="right" open={!!selectedResource} onClose={() => setSelectedResource(null)} PaperProps={{ sx: { bgcolor: 'background.default', backgroundImage: 'none' } }}>
                <Box sx={{ width: { xs: '100vw', sm: 500 }, p: { xs: 2, sm: 4 }, height: '100%' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                        <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: { xs: '16px', sm: '20px' } }}>MARKET_ANALYTICS</Typography>
                        <IconButton onClick={() => setSelectedResource(null)} color="inherit"><CloseIcon /></IconButton>
                    </Box>
                    <Typography variant="h5" fontWeight="bold" color="primary.main" sx={{ fontSize: { xs: '18px', sm: '24px' } }}>{selectedResource.description}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>CODE: {selectedResource.code}</Typography>

                    <Box display="flex" gap={2} my={4} flexDirection={{ xs: 'column', sm: 'row' }}>
                        <Paper elevation={0} sx={{ p: 2, flex: 1, bgcolor: alpha(theme.palette.background.paper, 0.5), border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary">LATEST_PRICE</Typography>
                            <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(latest)}</Typography>
                        </Paper>
                        <Paper elevation={0} sx={{ p: 2, flex: 1, bgcolor: alpha(theme.palette.background.paper, 0.5), border: '1px solid', borderColor: trend >= 0 ? alpha(theme.palette.error.main, 0.5) : alpha(theme.palette.success.main, 0.5) }}>
                            <Typography variant="caption" color="text.secondary">MARKET_TREND</Typography>
                            <Box display="flex" alignItems="center" color={trend >= 0 ? 'error.main' : 'success.main'}>
                                {trend >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                                <Typography variant="h6" ml={1} sx={{ fontFamily: "'JetBrains Mono', monospace" }}>{Math.abs(trend).toFixed(1)}%</Typography>
                            </Box>
                        </Paper>
                    </Box>

                    <Box sx={{ height: 300, mt: 4 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.palette.text.secondary }} stroke="none" />
                                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} stroke="none" />
                                <RechartsTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: '8px' }} formatter={(val) => formatCurrency(val)} />
                                <Area type="monotone" dataKey="rate" stroke={theme.palette.primary.main} fill={theme.palette.primary.main} fillOpacity={0.2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Box>
                </Box>
            </Drawer>
        );
    };

    const resourceRows = useMemo(() => paginatedResources.map((res, index) => (
        <TableRow key={res.id} hover sx={{
            bgcolor: index % 2 === 0 ? 'transparent' : alpha(theme.palette.common.white, 0.01),
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
            '& td': { borderBottom: '1px solid rgba(255,255,255,0.05)' }
        }}>
            <TableCell sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                {(currentPage - 1) * itemsPerPage + index + 1}
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'primary.light' }}>
                {res.code || '---'}
            </TableCell>
            <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
                {res.description}
            </TableCell>
            <TableCell sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                {res.unit}
            </TableCell>

            
            <TableCell align="right" sx={{ p: '4px 16px' }}>
                <Box display="flex" justifyContent="flex-end" gap={0.5}>
                    <IconButton size="small" color="primary" onClick={() => handleOpenBrandModal(res)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.primary.main, 0.1) } }} title="Edit Brand Rates">
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="secondary" onClick={() => handleOpenBrandChart(res)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.secondary.main, 0.1) } }} title="Brand Price Chart">
                        <BarChartIcon fontSize="small" />
                    </IconButton>
                    {/* <IconButton size="small" color="primary" onClick={() => setSelectedResource(res)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.primary.main, 0.1) } }} title="Market Analytics">
                        <TimelineIcon fontSize="small" />
                    </IconButton> */}
                    <IconButton size="small" color="error" onClick={() => deleteResource(res.id)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
            </TableCell>
        </TableRow>
    )), [currentPage, deleteResource, ghostInputStyle, paginatedResources, regions, theme, updateResourceRate, handleOpenBrandModal, handleOpenBrandChart]);

    return (
        <Box>
            {/* TOP CONTROLS (IMPORT & REGIONS) */}
            <Grid container spacing={3} mb={3}>
                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 3, bgcolor: alpha(theme.palette.background.paper, 0.3), border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="subtitle2" mb={2} color="text.secondary" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>// IMPORT_EXCEL_LMR</Typography>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <TextField select fullWidth size="small" label="TARGET REGION" value={importRegion} onChange={e => setImportRegion(e.target.value)}>
                                {regions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                            </TextField>
                            <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                            <Button variant="outlined" color="primary" startIcon={<UploadIcon />} disabled={!importRegion} onClick={() => fileInputRef.current.click()} sx={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                                UPLOAD_DATA
                            </Button>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 3, bgcolor: alpha(theme.palette.background.paper, 0.3), border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="subtitle2" mb={2} color="text.secondary" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>// MANAGE_REGIONS</Typography>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <TextField fullWidth size="small" label="NEW_REGION" value={newRegion} onChange={e => setNewRegion(e.target.value)} />
                            <Button variant="contained" disabled={!newRegion} onClick={async () => { await window.api.db.createRegion(newRegion); setNewRegion(""); loadData(); }} sx={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", boxShadow: 'none' }}>
                                ADD_REGION
                            </Button>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* SEARCH & QUICK ADD */}
            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, mb: 3, bgcolor: alpha(theme.palette.background.paper, 0.3), border: '1px solid', borderColor: 'divider', borderTop: `3px solid ${theme.palette.primary.main}`, borderRadius: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <AddCircleOutlineIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px' }}>
                        RESOURCE_DIRECTORY
                    </Typography>
                </Box>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={3}>
                        <TextField fullWidth placeholder="Search Materials..." size="small" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
                    </Grid>

                    <Grid item sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
                        <Divider orientation="vertical" flexItem sx={{ height: 40 }} />
                    </Grid>

                    <Grid item xs={12} md>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={3} md={2}><TextField fullWidth size="small" label="CODE" value={resCode} onChange={e => setResCode(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={5} md={5}><TextField fullWidth size="small" label="DESCRIPTION" value={resDesc} onChange={e => setResDesc(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={2} md={2}><TextField fullWidth size="small" label="UNIT" value={resUnit} onChange={e => setResUnit(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={2} md={3}>
                                <Button fullWidth variant="contained" color="primary" sx={{ height: { xs: 40, sm: '100%' }, fontFamily: "'JetBrains Mono', monospace", boxShadow: 'none' }} onClick={async () => { await window.api.db.createResource({ code: resCode, description: resDesc, unit: resUnit }); setResCode(""); setResDesc(""); loadData(); }}>
                                    REGISTER_ITEM
                                </Button>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>

            {/* TABLE HEADER & PAGINATION */}
            <Box display="flex" justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} flexDirection={{ xs: 'column', sm: 'row' }} gap={2} mb={2}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace" }}>
                    SHOWING {paginatedResources.length} OF {filteredResources.length} ENTRIES
                </Typography>
                <Pagination count={totalPages} page={currentPage} onChange={(e, v) => setCurrentPage(v)} color="primary" size="small" />
            </Box>

            {/* 🔥 BEAUTIFIED EXCEL-STYLE TABLE */}
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.paper, 0.2), borderRadius: 2, overflowX: 'auto', height: 'auto' }}>
                <Table size="small" sx={{ minWidth: 1000 }}>
                    <TableHead sx={{ bgcolor: alpha(theme.palette.background.paper, 0.9) }}>
                        <TableRow>
                            <TableCell sx={{ width: 40, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>NO</TableCell>
                            <TableCell sx={{ width: 120, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CODE</TableCell>
                            <TableCell sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DESCRIPTION</TableCell>
                            <TableCell sx={{ width: 80, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>UNIT</TableCell>

                            <TableCell align="right" sx={{ width: 80, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {resourceRows}
                    </TableBody>
                </Table>
            </TableContainer>

            <InflationDrawer />

            {/* BRAND RATES MODAL */}
            <Dialog
                open={brandModalOpen}
                onClose={() => setBrandModalOpen(false)}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: 'background.default',
                        backgroundImage: 'none',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2
                    }
                }}
            >
                {/* DIALOG HEADER */}
                <DialogTitle sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    pb: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 2
                }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                        <EditIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                        <Typography variant="h6" component="span" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '15px' }}>
                            BRAND_RATES_EDITOR
                        </Typography>
                        {selectedMonthYear !== getCurrentMonthKey() && (
                            <Chip
                                icon={<HistoryIcon sx={{ fontSize: '14px !important' }} />}
                                label="HISTORY VIEW · READ-ONLY"
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}
                            />
                        )}
                    </Box>
                    <Box display="flex" alignItems="center" gap={1.5}>
                        {/* MONTH / YEAR SELECTORS */}
                        <Box display="flex" alignItems="center" gap={1} sx={{
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            border: '1px solid',
                            borderColor: alpha(theme.palette.primary.main, 0.25),
                            borderRadius: 1.5,
                            px: 1.5,
                            py: 0.5
                        }}>
                            <CalendarMonthIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                            <TextField
                                select
                                size="small"
                                variant="standard"
                                label=""
                                value={selectedMonthYear ? Number(selectedMonthYear.split('-')[1]) : new Date().getMonth() + 1}
                                onChange={(e) => {
                                    const year = selectedMonthYear ? selectedMonthYear.split('-')[0] : String(new Date().getFullYear());
                                    const newKey = `${year}-${String(e.target.value).padStart(2, '0')}`;
                                    setSelectedMonthYear(newKey);
                                    if (brandModalResource) {
                                        const history = brandModalResource.rates?.brandRatesHistory || {};
                                        setTempBrandRates(JSON.parse(JSON.stringify(Array.isArray(history[newKey]) ? history[newKey] : [])));
                                    }
                                }}
                                InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'text.primary', minWidth: 90 } }}
                                sx={{ '& .MuiSelect-select': { py: 0 } }}
                            >
                                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                                    <MenuItem key={i+1} value={i+1} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{m}</MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select
                                size="small"
                                variant="standard"
                                label=""
                                value={selectedMonthYear ? Number(selectedMonthYear.split('-')[0]) : new Date().getFullYear()}
                                onChange={(e) => {
                                    const month = selectedMonthYear ? selectedMonthYear.split('-')[1] : String(new Date().getMonth() + 1).padStart(2, '0');
                                    const newKey = `${e.target.value}-${month}`;
                                    setSelectedMonthYear(newKey);
                                    if (brandModalResource) {
                                        const history = brandModalResource.rates?.brandRatesHistory || {};
                                        setTempBrandRates(JSON.parse(JSON.stringify(Array.isArray(history[newKey]) ? history[newKey] : [])));
                                    }
                                }}
                                InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'text.primary', minWidth: 65 } }}
                                sx={{ '& .MuiSelect-select': { py: 0 } }}
                            >
                                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                    <MenuItem key={y} value={y} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{y}</MenuItem>
                                ))}
                            </TextField>
                        </Box>
                        <IconButton onClick={() => setBrandModalOpen(false)} color="inherit" size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ p: 3 }}>
                    {/* RESOURCE INFO */}
                    {brandModalResource && (
                        <Box sx={{ mb: 2.5, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.06), borderRadius: 1.5, border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.15) }}>
                            <Typography variant="subtitle1" fontWeight="bold" color="primary.main" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' }}>
                                {brandModalResource.description}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>
                                CODE: {brandModalResource.code || 'N/A'} &nbsp;|&nbsp; UNIT: {brandModalResource.unit || 'nos'}
                                &nbsp;|&nbsp; PERIOD: {selectedMonthYear || '—'}
                                {selectedMonthYear !== getCurrentMonthKey() && (
                                    <span style={{ color: theme.palette.warning.main, marginLeft: 8 }}>⚠ Historical data is read-only</span>
                                )}
                            </Typography>
                        </Box>
                    )}

                    {/* BRAND RATES TABLE */}
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.paper, 0.2), borderRadius: 2, overflowX: 'auto', maxHeight: 360 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: alpha(theme.palette.background.paper, 0.95), color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', minWidth: 160, fontWeight: 'bold' }}>BRAND</TableCell>
                                    {regions.map(r => (
                                        <TableCell key={r.id} sx={{ bgcolor: alpha(theme.palette.background.paper, 0.95), color: 'primary.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', minWidth: 110, fontWeight: 'bold' }}>
                                            {r.name.toUpperCase()}
                                        </TableCell>
                                    ))}
                                    {selectedMonthYear === getCurrentMonthKey() && (
                                        <TableCell align="right" sx={{ bgcolor: alpha(theme.palette.background.paper, 0.95), width: 60 }} />
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {tempBrandRates.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={regions.length + 2} align="center" sx={{ py: 4, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                                            {selectedMonthYear === getCurrentMonthKey()
                                                ? "NO BRAND RATES REGISTERED. CLICK '+ ADD BRAND' BELOW."
                                                : `NO BRAND RATES RECORDED FOR ${selectedMonthYear}.`
                                            }
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    tempBrandRates.map((row, index) => {
                                        const isCurrentMonth = selectedMonthYear === getCurrentMonthKey();
                                        const inputSx = {
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '12px',
                                            color: 'text.primary',
                                            width: '100%',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: isCurrentMonth
                                                ? alpha(theme.palette.common.white, 0.12)
                                                : alpha(theme.palette.warning.main, 0.15),
                                            bgcolor: isCurrentMonth
                                                ? alpha(theme.palette.common.white, 0.02)
                                                : alpha(theme.palette.warning.main, 0.03),
                                        };
                                        return (
                                            <TableRow key={index} sx={{ '& td': { borderBottom: '1px solid rgba(255,255,255,0.05)' } }}>
                                                <TableCell>
                                                    <InputBase
                                                        value={row.brand || ""}
                                                        placeholder="Brand Name..."
                                                        disabled={!isCurrentMonth}
                                                        onChange={(e) => {
                                                            const updated = [...tempBrandRates];
                                                            updated[index] = { ...updated[index], brand: e.target.value };
                                                            setTempBrandRates(updated);
                                                        }}
                                                        sx={inputSx}
                                                    />
                                                </TableCell>
                                                {regions.map(r => (
                                                    <TableCell key={r.id}>
                                                        <InputBase
                                                            type="number"
                                                            value={row[r.name] !== undefined ? row[r.name] : ""}
                                                            placeholder="0"
                                                            disabled={!isCurrentMonth}
                                                            onChange={(e) => {
                                                                const updated = [...tempBrandRates];
                                                                updated[index] = { ...updated[index], [r.name]: e.target.value === "" ? "" : Number(e.target.value) };
                                                                setTempBrandRates(updated);
                                                            }}
                                                            sx={inputSx}
                                                        />
                                                    </TableCell>
                                                ))}
                                                {isCurrentMonth && (
                                                    <TableCell align="right" sx={{ p: '2px 8px' }}>
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={() => {
                                                                const updated = tempBrandRates.filter((_, idx) => idx !== index);
                                                                setTempBrandRates(updated);
                                                            }}
                                                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* ADD BRAND BUTTON — only current month */}
                    {selectedMonthYear === getCurrentMonthKey() && (
                        <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={() => {
                                const newRow = { brand: "" };
                                regions.forEach(r => { newRow[r.name] = ""; });
                                setTempBrandRates([...tempBrandRates, newRow]);
                            }}
                            sx={{ mt: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                        >
                            + ADD BRAND
                        </Button>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
                    <Button
                        onClick={() => setBrandModalOpen(false)}
                        sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}
                    >
                        CLOSE
                    </Button>
                    {selectedMonthYear === getCurrentMonthKey() && (
                        <Button
                            variant="contained"
                            color="success"
                            onClick={async () => {
                                if (!brandModalResource) return;
                                const currentKey = getCurrentMonthKey();
                                const cleanedBrandRates = tempBrandRates.filter(r => String(r.brand || '').trim() !== '');
                                const existingHistory = (brandModalResource.rates?.brandRatesHistory && typeof brandModalResource.rates.brandRatesHistory === 'object')
                                    ? brandModalResource.rates.brandRatesHistory
                                    : {};
                                const updatedHistory = { ...existingHistory, [currentKey]: cleanedBrandRates };
                                const updatedRates = { ...brandModalResource.rates, brandRatesHistory: updatedHistory };
                                await updateResourceRate(brandModalResource.id, 'rates', updatedRates);
                                setBrandModalOpen(false);
                            }}
                            sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', boxShadow: 'none' }}
                        >
                            SAVE_CHANGES
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* ===== BRAND PRICE CHART DIALOG ===== */}
            {brandChartOpen && brandChartResource && (() => {
                const REGION_COLORS = [
                    '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
                    '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'
                ];
                const history = brandChartResource.rates?.brandRatesHistory || {};
                const rowData = Array.isArray(history[brandChartMonthYear]) ? history[brandChartMonthYear] : [];

                // Build chart data: one entry per brand, keys per region
                const chartData = rowData.map(row => {
                    const entry = { brand: row.brand || 'Unknown' };
                    let total = 0;
                    regions.forEach(r => {
                        const val = Number(row[r.name] || 0);
                        entry[r.name] = val;
                        total += val;
                    });
                    entry._avg = regions.length ? total / regions.length : 0;
                    return entry;
                });

                // Summary stats
                const allVals = chartData.flatMap(d => regions.map(r => ({ brand: d.brand, region: r.name, val: d[r.name] })));
                const highestEntry = allVals.reduce((a, b) => b.val > a.val ? b : a, { brand: '-', region: '-', val: 0 });
                const lowestNonZero = allVals.filter(x => x.val > 0).reduce((a, b) => b.val < a.val ? b : a, { brand: '-', region: '-', val: Infinity });

                // All historical months for this resource (for the dropdown)
                const availableMonths = Object.keys(history).sort().reverse();

                const MonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

                const CustomTooltip = ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                        <Paper elevation={0} sx={{
                            p: 1.5, bgcolor: 'rgba(10,20,45,0.97)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 2, minWidth: 160
                        }}>
                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: 'bold', color: 'primary.main', mb: 1 }}>
                                {label}
                            </Typography>
                            {payload.map((p, i) => (
                                <Box key={i} display="flex" justifyContent="space-between" gap={2} mb={0.3}>
                                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: p.fill }}>{p.dataKey}</Typography>
                                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'text.primary', fontWeight: 'bold' }}>
                                        {formatCurrency(p.value)}
                                    </Typography>
                                </Box>
                            ))}
                        </Paper>
                    );
                };

                return (
                    <Dialog
                        open={brandChartOpen}
                        onClose={() => setBrandChartOpen(false)}
                        maxWidth="xl"
                        fullWidth
                        PaperProps={{
                            sx: {
                                bgcolor: '#080f1e',
                                backgroundImage: 'none',
                                border: '1px solid rgba(59,130,246,0.2)',
                                borderRadius: 3,
                                maxHeight: '92vh'
                            }
                        }}
                    >
                        {/* HEADER */}
                        <DialogTitle sx={{
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.08) 100%)',
                            borderBottom: '1px solid rgba(255,255,255,0.07)',
                            p: 2.5
                        }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                                <Box display="flex" alignItems="center" gap={1.5}>
                                    <Box sx={{
                                        width: 36, height: 36, borderRadius: 1.5,
                                        bgcolor: 'rgba(59,130,246,0.15)',
                                        border: '1px solid rgba(59,130,246,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <BarChartIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
                                    </Box>
                                    <Box>
                                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '14px', color: '#fff', letterSpacing: '1px' }}>
                                            BRAND_PRICE_ANALYTICS
                                        </Typography>
                                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.45)', mt: 0.2 }}>
                                            {brandChartResource.description} &nbsp;·&nbsp; CODE: {brandChartResource.code || '—'} &nbsp;·&nbsp; UNIT: {brandChartResource.unit || '—'}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Month/Year picker */}
                                <Box display="flex" alignItems="center" gap={2}>
                                    <Box display="flex" alignItems="center" gap={1} sx={{
                                        bgcolor: 'rgba(59,130,246,0.08)',
                                        border: '1px solid rgba(59,130,246,0.22)',
                                        borderRadius: 1.5, px: 1.5, py: 0.6
                                    }}>
                                        <CalendarMonthIcon sx={{ fontSize: 15, color: '#3b82f6' }} />
                                        <TextField
                                            select size="small" variant="standard" label=""
                                            value={brandChartMonthYear ? Number(brandChartMonthYear.split('-')[1]) : new Date().getMonth() + 1}
                                            onChange={(e) => {
                                                const year = brandChartMonthYear ? brandChartMonthYear.split('-')[0] : String(new Date().getFullYear());
                                                setBrandChartMonthYear(`${year}-${String(e.target.value).padStart(2, '0')}`);
                                            }}
                                            InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#fff', minWidth: 95 } }}
                                        >
                                            {MonthNames.map((m, i) => (
                                                <MenuItem key={i+1} value={i+1} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{m}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            select size="small" variant="standard" label=""
                                            value={brandChartMonthYear ? Number(brandChartMonthYear.split('-')[0]) : new Date().getFullYear()}
                                            onChange={(e) => {
                                                const month = brandChartMonthYear ? brandChartMonthYear.split('-')[1] : String(new Date().getMonth() + 1).padStart(2, '0');
                                                setBrandChartMonthYear(`${e.target.value}-${month}`);
                                            }}
                                            InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#fff', minWidth: 65 } }}
                                        >
                                            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                                <MenuItem key={y} value={y} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{y}</MenuItem>
                                            ))}
                                        </TextField>
                                    </Box>
                                    <IconButton onClick={() => setBrandChartOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#fff' } }}>
                                        <CloseIcon />
                                    </IconButton>
                                </Box>
                            </Box>
                        </DialogTitle>

                        <DialogContent sx={{ p: 3, bgcolor: '#080f1e' }}>
                            {chartData.length === 0 ? (
                                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={8} gap={2}>
                                    <BarChartIcon sx={{ fontSize: 60, color: 'rgba(59,130,246,0.25)' }} />
                                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>
                                        NO BRAND DATA FOR {brandChartMonthYear}
                                    </Typography>
                                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                                        Add brand rates using the edit button to see comparisons here.
                                    </Typography>
                                    {availableMonths.length > 0 && (
                                        <Box display="flex" gap={1} flexWrap="wrap" justifyContent="center" mt={1}>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Available periods:</Typography>
                                            {availableMonths.map(mk => (
                                                <Chip key={mk} label={mk} size="small" onClick={() => setBrandChartMonthYear(mk)}
                                                    sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', cursor: 'pointer', bgcolor: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', '&:hover': { bgcolor: 'rgba(59,130,246,0.2)' } }} />
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <>
                                    {/* SUMMARY CARDS */}
                                    <Box display="flex" gap={2} mb={3} flexWrap="wrap" marginTop={2}>
                                        <Paper elevation={0} sx={{
                                            flex: 1, minWidth: 180, p: 2, borderRadius: 2,
                                            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))',
                                            border: '1px solid rgba(16,185,129,0.25)'
                                        }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <EmojiEventsIcon sx={{ fontSize: 16, color: '#10b981' }} />
                                                <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '1px' }}>HIGHEST RATE</Typography>
                                            </Box>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '18px', color: '#10b981' }}>
                                                {formatCurrency(highestEntry.val)}
                                            </Typography>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', mt: 0.3 }}>
                                                {highestEntry.brand} · {highestEntry.region}
                                            </Typography>
                                        </Paper>

                                        <Paper elevation={0} sx={{
                                            flex: 1, minWidth: 180, p: 2, borderRadius: 2,
                                            background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
                                            border: '1px solid rgba(239,68,68,0.25)'
                                        }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <TrendingDownIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                                                <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '1px' }}>LOWEST RATE</Typography>
                                            </Box>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '18px', color: '#ef4444' }}>
                                                {lowestNonZero.val === Infinity ? '—' : formatCurrency(lowestNonZero.val)}
                                            </Typography>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', mt: 0.3 }}>
                                                {lowestNonZero.val === Infinity ? 'No data' : `${lowestNonZero.brand} · ${lowestNonZero.region}`}
                                            </Typography>
                                        </Paper>

                                        <Paper elevation={0} sx={{
                                            flex: 1, minWidth: 180, p: 2, borderRadius: 2,
                                            background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))',
                                            border: '1px solid rgba(59,130,246,0.25)'
                                        }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <BarChartIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
                                                <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '1px' }}>BRANDS TRACKED</Typography>
                                            </Box>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '28px', color: '#3b82f6' }}>
                                                {chartData.length}
                                            </Typography>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', mt: 0.3 }}>
                                                across {regions.length} region{regions.length !== 1 ? 's' : ''}
                                            </Typography>
                                        </Paper>

                                        <Paper elevation={0} sx={{
                                            flex: 1, minWidth: 180, p: 2, borderRadius: 2,
                                            background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
                                            border: '1px solid rgba(245,158,11,0.25)'
                                        }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <CalendarMonthIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                                                <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '1px' }}>PERIOD</Typography>
                                            </Box>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: '18px', color: '#f59e0b' }}>
                                                {brandChartMonthYear ? `${MonthNames[Number(brandChartMonthYear.split('-')[1]) - 1]?.slice(0,3)} ${brandChartMonthYear.split('-')[0]}` : '—'}
                                            </Typography>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', mt: 0.3 }}>
                                                {brandChartMonthYear === getCurrentMonthKey() ? 'Current month' : 'Historical data'}
                                            </Typography>
                                        </Paper>
                                    </Box>

                                    {/* GROUPED BAR CHART */}
                                    <Paper elevation={0} sx={{
                                        p: 3, borderRadius: 2,
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)'
                                    }}>
                                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.4)', mb: 2.5, letterSpacing: '1px' }}>
                                            // BRAND_PRICE_COMPARISON · {brandChartMonthYear}
                                        </Typography>
                                        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 60)}>
                                            <BarChart
                                                data={chartData}
                                                margin={{ top: 20, right: 30, left: 20, bottom: chartData.length > 4 ? 60 : 20 }}
                                                barCategoryGap="25%"
                                                barGap={3}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                                <XAxis
                                                    dataKey="brand"
                                                    tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    angle={chartData.length > 5 ? -25 : 0}
                                                    textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                                                    interval={0}
                                                />
                                                <YAxis
                                                    tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                                                />
                                                <RechartsTooltip
                                                    content={<CustomTooltip />}
                                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                                />
                                                <Legend
                                                    iconType="circle"
                                                    iconSize={8}
                                                    formatter={(value) => (
                                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{value}</span>
                                                    )}
                                                />
                                                {regions.map((r, ri) => (
                                                    <Bar
                                                        key={r.id}
                                                        dataKey={r.name}
                                                        name={r.name}
                                                        fill={REGION_COLORS[ri % REGION_COLORS.length]}
                                                        radius={[4, 4, 0, 0]}
                                                        maxBarSize={48}
                                                    >
                                                        <LabelList
                                                            dataKey={r.name}
                                                            position="top"
                                                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fill: 'rgba(255,255,255,0.45)' }}
                                                            formatter={(v) => v > 0 ? (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v) : ''}
                                                        />
                                                    </Bar>
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Paper>

                                    {/* AVAILABLE PERIODS QUICK-NAV */}
                                    {availableMonths.length > 1 && (
                                        <Box mt={3}>
                                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)', mb: 1, letterSpacing: '1px' }}>
                                                // AVAILABLE_PERIODS
                                            </Typography>
                                            <Box display="flex" gap={1} flexWrap="wrap">
                                                {availableMonths.map(mk => (
                                                    <Chip
                                                        key={mk} label={mk} size="small"
                                                        onClick={() => setBrandChartMonthYear(mk)}
                                                        variant={brandChartMonthYear === mk ? 'filled' : 'outlined'}
                                                        sx={{
                                                            fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                                                            cursor: 'pointer',
                                                            bgcolor: brandChartMonthYear === mk ? 'rgba(59,130,246,0.25)' : 'transparent',
                                                            color: brandChartMonthYear === mk ? '#3b82f6' : 'rgba(255,255,255,0.4)',
                                                            border: `1px solid ${brandChartMonthYear === mk ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                                            '&:hover': { bgcolor: 'rgba(59,130,246,0.15)' }
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                        </Box>
                                    )}
                                </>
                            )}
                        </DialogContent>

                        <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.06)', bgcolor: '#080f1e' }}>
                            <Button onClick={() => setBrandChartOpen(false)} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                CLOSE
                            </Button>
                        </DialogActions>
                    </Dialog>
                );
            })()}
        </Box>
    );
}
