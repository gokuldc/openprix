import { memo, useCallback, useDeferredValue, useState, useMemo, useRef, useEffect } from "react";
import {
    Box, Button, Typography, Paper, Grid, TextField, MenuItem, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton,
    InputAdornment, Pagination, Divider, alpha, useTheme, InputBase, Backdrop,
    CircularProgress, LinearProgress, FormControlLabel, Switch
} from "@mui/material";
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import BarChartIcon from '@mui/icons-material/BarChart';
import DownloadIcon from '@mui/icons-material/Download';
import { useSettings } from "../../context/SettingsContext";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import InflationDrawer from "./InflationDrawer";
import BrandRatesModal from "./BrandRatesModal";
import BrandPriceChartModal from "./BrandPriceChartModal";

// 🔥 DEBOUCED SEARCH INPUT COMPONENT FOR HIGH PERFORMANCE
const SearchInput = memo(({ value, onChange }) => {
    const [localVal, setLocalVal] = useState(value);
    useEffect(() => {
        setLocalVal(value);
    }, [value]);
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localVal !== value) {
                onChange(localVal);
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [localVal, onChange, value]);
    return (
        <TextField
            fullWidth
            placeholder="Search Materials..."
            size="small"
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
    );
});

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

// 🔥 HIGH-PERFORMANCE MEMOIZED RESOURCE ROW
const ResourceRow = memo(({
    res,
    index,
    currentPage,
    itemsPerPage,
    selectedRegion,
    handleSaveRate,
    handleOpenBrandModal,
    handleOpenBrandChart,
    openDeleteResourceModal,
    ghostInputStyle,
    theme
}) => {
    return (
        <TableRow hover sx={{
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
            {selectedRegion && (
                <TableCell>
                    <RateInputCell
                        resource={res}
                        regionName={selectedRegion}
                        onSave={handleSaveRate}
                        ghostInputStyle={ghostInputStyle}
                    />
                </TableCell>
            )}

            <TableCell align="right" sx={{ p: '4px 16px' }}>
                <Box display="flex" justifyContent="flex-end" gap={0.5}>
                    <IconButton size="small" color="primary" onClick={() => handleOpenBrandModal(res)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.primary.main, 0.1) } }} title="Edit Brand Rates">
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="secondary" onClick={() => handleOpenBrandChart(res)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.secondary.main, 0.1) } }} title="Brand Price Chart">
                        <BarChartIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => openDeleteResourceModal(res.id, res.description)} sx={{ opacity: 0.6, '&:hover': { opacity: 1, bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
            </TableCell>
        </TableRow>
    );
});

// 🔥 HIGH-PERFORMANCE MATERIAL REGISTRATION FORM
const RegisterMaterialForm = memo(({ onRegister }) => {
    const [code, setCode] = useState("");
    const [desc, setDesc] = useState("");
    const [unit, setUnit] = useState("nos");

    const handleRegister = () => {
        if (!desc.trim()) return;
        onRegister({ code, description: desc, unit });
        setCode("");
        setDesc("");
    };

    return (
        <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3} md={2}>
                <TextField fullWidth size="small" label="CODE" value={code} onChange={e => setCode(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={6}>
                <TextField fullWidth size="small" label="DESCRIPTION" value={desc} onChange={e => setDesc(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={3} md={2}>
                <TextField fullWidth size="small" label="UNIT" value={unit} onChange={e => setUnit(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={12} md={2}>
                <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    sx={{
                        height: 40,
                        fontFamily: "'JetBrains Mono', monospace",
                        boxShadow: 'none',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                        borderRadius: 1.5,
                        px: 2,
                        whiteSpace: 'nowrap',
                        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                        '&:hover': {
                            background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                        }
                    }}
                    onClick={handleRegister}
                >
                    REGISTER_ITEM
                </Button>
            </Grid>
        </Grid>
    );
});

export default function ResourcesTab({ regions, resources, loadData }) {
    const theme = useTheme();
    const { formatCurrency } = useSettings();
    const fileInputRef = useRef(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [importRegion, setImportRegion] = useState("");
    const [newRegion, setNewRegion] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const [selectedResource, setSelectedResource] = useState(null);
    const [brandModalOpen, setBrandModalOpen] = useState(false);
    const [brandModalResource, setBrandModalResource] = useState(null);
    const [tempBrandRates, setTempBrandRates] = useState([]);
    const [selectedMonthYear, setSelectedMonthYear] = useState("");
    const [selectedRegion, setSelectedRegion] = useState(regions[0]?.name || "");
    const [brandSearchTerm, setBrandSearchTerm] = useState("");
    const [uploadStatus, setUploadStatus] = useState({ active: false, current: 0, total: 0 });

    useEffect(() => {
        if (regions.length > 0 && !selectedRegion) {
            setSelectedRegion(regions[0].name);
        }
    }, [regions, selectedRegion]);

    const [brandChartOpen, setBrandChartOpen] = useState(false);
    const [brandChartResource, setBrandChartResource] = useState(null);
    const [brandChartMonthYear, setBrandChartMonthYear] = useState("");
    const [analyticsTab, setAnalyticsTab] = useState("brands");
    const [hideEmptyRates, setHideEmptyRates] = useState(true);

    const [deleteConfig, setDeleteConfig] = useState({
        open: false,
        id: null,
        name: "",
        type: null
    });

    const deferredSearchTerm = useDeferredValue(searchTerm);

    const getCurrentMonthKey = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const filteredResources = useMemo(() => {
        const normalizedSearch = deferredSearchTerm.toLowerCase();
        return resources.filter(r => {
            const matchesSearch = (r.code || "").toLowerCase().includes(normalizedSearch) ||
                (r.description || "").toLowerCase().includes(normalizedSearch);
            if (!matchesSearch) return false;

            if (selectedRegion && hideEmptyRates) {
                const rate = r.rates?.[selectedRegion];
                return rate !== undefined && rate !== null && rate !== "" && Number(rate) > 0;
            }
            return true;
        });
    }, [resources, deferredSearchTerm, selectedRegion, hideEmptyRates]);

    const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
    const paginatedResources = useMemo(() => (
        filteredResources.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    ), [filteredResources, currentPage]);

    const startEntry = filteredResources.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const endEntry = Math.min(currentPage * itemsPerPage, filteredResources.length);

    const handleSearchChange = useCallback((val) => {
        setSearchTerm(val);
        setCurrentPage(1);
    }, []);

    const handleRegionChange = useCallback((e) => {
        setSelectedRegion(e.target.value);
        setCurrentPage(1);
    }, []);

    const handleHideEmptyRatesChange = useCallback((e) => {
        setHideEmptyRates(e.target.checked);
        setCurrentPage(1);
    }, []);

    const handleRegisterResource = useCallback(async (data) => {
        await window.api.db.createResource(data);
        loadData();
    }, [loadData]);

    // --- LOGIC HANDLERS ---

    // Triggered when user clicks delete icon on a resource row
    const openDeleteResourceModal = useCallback((id, description) => {
        setDeleteConfig({ open: true, id, name: description, type: 'resource' });
    }, []);

    // Triggered when user clicks delete icon on a region (if you add that UI)
    const openDeleteRegionModal = (id, name) => {
        setDeleteConfig({ open: true, id, name, type: 'region' });
    };

    // The actual API call after confirmation
    const handleConfirmDelete = async () => {
        if (deleteConfig.type === 'resource') {
            await window.api.db.deleteResource(deleteConfig.id);
        } else if (deleteConfig.type === 'region') {
            await window.api.db.deleteRegion(deleteConfig.id);
        }
        setDeleteConfig({ open: false, id: null, name: "", type: null });
        loadData();
    };

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
        setBrandSearchTerm("");
        setBrandModalOpen(true);
    }, []);

    const handleOpenBrandChart = useCallback((res) => {
        setBrandChartResource(res);
        setBrandChartMonthYear(getCurrentMonthKey());
        setBrandChartOpen(true);
    }, []);

    // Stable cell save handler
    const handleSaveRate = useCallback(async (id, newVal) => {
        const res = resources.find(r => r.id === id);
        if (!res) return;
        const updatedRates = { ...res.rates, [selectedRegion]: newVal };
        await updateResourceRate(id, 'rates', updatedRates, selectedRegion);
    }, [resources, selectedRegion, updateResourceRate]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !importRegion) return;

        setUploadStatus({ active: true, current: 0, total: 0 });

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

                if (headerRowIdx === -1) {
                    setUploadStatus({ active: false, current: 0, total: 0 });
                    return alert("Upload Failed: Could not find a header row containing 'Code'.");
                }

                const headers = rawSheetData[headerRowIdx].map(h => typeof h === 'string' ? h.toLowerCase().trim() : '');
                const codeIdx = headers.findIndex(h => h === 'code' || h.includes('code'));
                const descIdx = headers.findIndex(h => h.includes('description') || h.includes('item'));
                const unitIdx = headers.findIndex(h => h === 'unit' || h.includes('unit'));
                const rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('price'));

                if (codeIdx === -1 || descIdx === -1 || rateIdx === -1) {
                    setUploadStatus({ active: false, current: 0, total: 0 });
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

                if (formattedData.length === 0) {
                    setUploadStatus({ active: false, current: 0, total: 0 });
                    return alert("No valid material rows found under the headers.");
                }

                const total = formattedData.length;
                setUploadStatus({ active: true, current: 0, total });

                const bulkPayload = formattedData.map(item => {
                    let existingRes = resources.find(r => r.code === item.code);
                    if (existingRes) {
                        const newRates = { ...existingRes.rates, [importRegion]: item.rate };
                        const currentHistory = Array.isArray(existingRes.rateHistory) ? existingRes.rateHistory : [];
                        const updatedHistory = [
                            ...currentHistory,
                            { date: new Date().toISOString().split('T')[0], rate: item.rate, region: importRegion }
                        ];
                        return {
                            id: existingRes.id,
                            code: existingRes.code,
                            description: existingRes.description,
                            unit: existingRes.unit,
                            rates: JSON.stringify(newRates),
                            rateHistory: JSON.stringify(updatedHistory)
                        };
                    } else {
                        return {
                            id: null,
                            code: item.code,
                            description: item.description,
                            unit: item.unit,
                            rates: JSON.stringify({ [importRegion]: item.rate }),
                            rateHistory: JSON.stringify([{ date: new Date().toISOString().split('T')[0], rate: item.rate, region: importRegion }])
                        };
                    }
                });

                setUploadStatus({ active: true, current: total, total });
                await window.api.db.bulkSaveResources(bulkPayload);

                alert(`Successfully imported ${formattedData.length} items into the [${importRegion}] market!`);
                loadData();
            } catch (err) {
                console.error("Import Error:", err);
                alert("Failed to parse Excel file. Is the file corrupted?");
            } finally {
                setUploadStatus({ active: false, current: 0, total: 0 });
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsBinaryString(file);
    };

    const downloadTemplate = async () => {
        try {
            const XLSX = await import('xlsx');
            const headers = [["No", "Code", "Description", "Unit", "Lmr Rate (₹)"]];
            // Add some sample data rows
            const sampleData = [
                [1, "0001", "Hire charges of Coaltar Boiler 900 to 1400 litres", "Day", 100],
                [2, "0002", "Bitumen Emulsion", "Tonne", 45000]
            ];
            const sheetData = [...headers, ...sampleData];
            const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "LMR Template");

            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
            const s2ab = (s) => {
                const buf = new ArrayBuffer(s.length);
                const view = new Uint8Array(buf);
                for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
                return buf;
            };
            const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "LMR_Upload_Template.xlsx";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to generate template:", error);
            alert("Error downloading template.");
        }
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
        <ResourceRow
            key={res.id}
            res={res}
            index={index}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            selectedRegion={selectedRegion}
            handleSaveRate={handleSaveRate}
            handleOpenBrandModal={handleOpenBrandModal}
            handleOpenBrandChart={handleOpenBrandChart}
            openDeleteResourceModal={openDeleteResourceModal}
            ghostInputStyle={ghostInputStyle}
            theme={theme}
        />
    )), [currentPage, openDeleteResourceModal, paginatedResources, theme, handleOpenBrandModal, handleOpenBrandChart, selectedRegion, ghostInputStyle, itemsPerPage, handleSaveRate]);

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
                            <Button variant="outlined" color="secondary" startIcon={<DownloadIcon />} onClick={downloadTemplate} sx={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                                DOWNLOAD_TEMPLATE
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
            <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, mb: 3, bgcolor: alpha(theme.palette.background.paper, 0.3), border: '1px solid', borderColor: 'divider', borderTop: `3px solid ${theme.palette.primary.main}`, borderRadius: 2 }}>
                {/* SECTION 1: SEARCH & FILTERS */}
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <SearchIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px' }}>
                        SEARCH_AND_FILTERS
                    </Typography>
                </Box>
                <Grid container spacing={2.5} alignItems="center" mb={3}>
                    <Grid item xs={12} sm={6} md={5}>
                        <SearchInput value={searchTerm} onChange={handleSearchChange} />
                    </Grid>

                    <Grid item xs={12} sm={4} md={3}>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="SELECT REGION"
                            value={selectedRegion}
                            onChange={handleRegionChange}
                        >
                            {regions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={2} md={3}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={hideEmptyRates}
                                    onChange={handleHideEmptyRatesChange}
                                    color="primary"
                                    size="small"
                                />
                            }
                            label="Hide Empty"
                            sx={{
                                '& .MuiFormControlLabel-label': {
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '11px',
                                    color: 'rgba(255,255,255,0.6)',
                                    letterSpacing: '0.5px'
                                }
                            }}
                        />
                    </Grid>
                </Grid>

                <Divider sx={{ my: 2.5, borderColor: 'rgba(255,255,255,0.06)' }} />

                {/* SECTION 2: REGISTER NEW MATERIAL */}
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <AddCircleOutlineIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px' }}>
                        QUICK_REGISTER_NEW_MATERIAL
                    </Typography>
                </Box>
                <RegisterMaterialForm onRegister={handleRegisterResource} />
            </Paper>

            {/* 🔥 BEAUTIFIED EXCEL-STYLE TABLE */}
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.paper, 0.2), borderRadius: '8px 8px 0 0', overflowX: 'auto', height: 'auto' }}>
                <Table size="small" sx={{ minWidth: 1000 }}>
                    <TableHead sx={{ bgcolor: alpha(theme.palette.background.paper, 0.9) }}>
                        <TableRow>
                            <TableCell sx={{ width: 40, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>NO</TableCell>
                            <TableCell sx={{ width: 120, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CODE</TableCell>
                            <TableCell sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DESCRIPTION</TableCell>
                            <TableCell sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>UNIT</TableCell>
                            {selectedRegion && (
                                <TableCell sx={{ color: 'primary.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>
                                    {selectedRegion.toUpperCase()} RATE
                                </TableCell>
                            )}
                            <TableCell align="right" sx={{ width: 80, color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {resourceRows}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* PROFESSIONAL INTEGRATED PAGINATION FOOTER */}
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{
                p: 2,
                bgcolor: alpha(theme.palette.background.paper, 0.15),
                border: '1px solid',
                borderColor: 'divider',
                borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                mb: 3
            }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                    SHOWING {startEntry}–{endEntry} OF {filteredResources.length} ENTRIES
                </Typography>
                <Pagination
                    count={totalPages}
                    page={currentPage}
                    onChange={(e, v) => setCurrentPage(v)}
                    color="primary"
                    size="medium"
                    showFirstButton
                    showLastButton
                    sx={{
                        '& .MuiPaginationItem-root': {
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            '&.Mui-selected': {
                                background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                                color: '#fff',
                                fontWeight: 'bold',
                                boxShadow: `0 2px 8px ${alpha('#2563eb', 0.4)}`,
                                '&:hover': {
                                    background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                                }
                            }
                        }
                    }}
                />
            </Box>

            {/* INFLATION DRAWER */}
            <InflationDrawer
                open={!!selectedResource}
                onClose={() => setSelectedResource(null)}
                resource={selectedResource}
                formatCurrency={formatCurrency}
            />

            {/* BRAND RATES MODAL */}
            <BrandRatesModal
                open={brandModalOpen}
                onClose={() => setBrandModalOpen(false)}
                resource={brandModalResource}
                regions={regions}
                selectedRegion={selectedRegion}
                updateResourceRate={updateResourceRate}
            />

            {/* BRAND PRICE CHART MODAL */}
            <BrandPriceChartModal
                open={brandChartOpen}
                onClose={() => setBrandChartOpen(false)}
                resource={brandChartResource}
                regions={regions}
                formatCurrency={formatCurrency}
            />

            {/* --- INTEGRATED DELETE CONFIRMATION MODAL --- */}
            <ConfirmDeleteModal
                open={deleteConfig.open}
                onClose={() => setDeleteConfig({ ...deleteConfig, open: false })}
                onConfirm={handleConfirmDelete}
                itemName={deleteConfig.name}
            />

            {/* EXCEL UPLOAD PROGRESS OVERLAY */}
            <Backdrop
                sx={{
                    color: '#fff',
                    zIndex: (theme) => theme.zIndex.drawer + 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    background: 'rgba(5, 10, 20, 0.85)',
                    backdropFilter: 'blur(10px)',
                }}
                open={uploadStatus.active}
            >
                <CircularProgress color="primary" size={60} thickness={4} />
                <Box textAlign="center" sx={{ maxWidth: 400, width: '90%' }}>
                    <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', mb: 1, letterSpacing: '1px' }}>
                        IMPORTING_EXCEL_DATA
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.6)', mb: 2 }}>
                        Processing items into [{importRegion}] market...
                    </Typography>
                    {uploadStatus.total > 0 && (
                        <Box sx={{ width: '100%', mt: 2 }}>
                            <LinearProgress
                                variant="determinate"
                                value={Math.round((uploadStatus.current / uploadStatus.total) * 100)}
                                sx={{
                                    height: 8,
                                    borderRadius: 4,
                                    bgcolor: 'rgba(255,255,255,0.1)',
                                    '& .MuiLinearProgress-bar': {
                                        borderRadius: 4,
                                        background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)'
                                    }
                                }}
                            />
                            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)', mt: 1, display: 'block' }}>
                                {uploadStatus.current} / {uploadStatus.total} ({Math.round((uploadStatus.current / uploadStatus.total) * 100)}%)
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Backdrop>
        </Box>
    );
}