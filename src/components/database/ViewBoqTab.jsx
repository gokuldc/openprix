import { useState, useMemo, useRef } from "react";
import { Box, Button, Typography, Paper, TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TableSortLabel, InputAdornment, Pagination, IconButton } from "@mui/material";
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import * as XLSX from "xlsx";
import AddCategoryModal from "./AddCategoryModal";
import ConfirmDeleteCategoryModal from "./ConfirmDeleteCategoryModal";
import AddDatabookEntryModal from "./AddDatabookEntryModal";

const STATIC_CATEGORIES = [
    "2. Earth Work",
    "3. Mortars",
    "4. Concrete work",
    "5. Reinforced Cement Concrete",
    "6. Brick Work",
    "7. Stone Work",
    "8. Marble & Granite Work",
    "9. Wood and PVC Work",
    "10. Steel Work",
    "11. Flooring",
    "12. Roofing",
    "13. Finishing",
    "14. Repairs to Buildings",
    "15. Dismantling and Demolishing",
    "16. Road Work",
    "17. Sanitary Installations",
    "18. Water Supply",
    "19. Drainage",
    "20. Pile Work",
    "21. Aluminium Work",
    "22. Water Proofing",
    "23. Rain Water Harvesting & Tubewells",
    "24. Conservation of Heritage Buildings",
    "25. Structural Glazing & Aluminium Composite Panel",
    "26. New Technologies and Materials",
    "30. Horticulture",
    "49. Horticulture and Landscaping",
    "50. Approved Observed data",
    "51. Approved OD for LSGD",
    "56. Investigation Rate",
    "60. OD Irrigation",
    "65. OD Harbour",
    "70. OD Ports",
    "72. KSEB Approved Data",
    "85. OD Mechanical",
    "100. KWA Approved Data"
];

const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
        if (window['pdfjs-dist/build/pdf']) {
            resolve(window['pdfjs-dist/build/pdf']);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => {
            const pdfjs = window['pdfjs-dist/build/pdf'];
            pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            resolve(pdfjs);
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

const parsePDFText = (text) => {
    const rawLines = text.split('\n')
        .map(l => l.trim())
        .filter(l => {
            if (!l) return false;
            if (l === "No Spec") return false;
            if (l.includes("Code Specification Rate")) return false;
            if (l === "PRICE") return false;
            if (l.match(/^Page \d+ of \d+/)) return false;
            return true;
        });

    const items = [];
    let currentItem = null;

    rawLines.forEach(line => {
        const matchStart = line.match(/^(\d+)\s+(\d+\.\d+(?:\.\d+)*)(?:\s+(.*))?$/);
        if (matchStart) {
            if (currentItem) {
                items.push(currentItem);
            }

            let restText = matchStart[3] ? matchStart[3].trim() : "";
            let rate = 0;
            let unit = "each";

            const matchEnd = restText.match(/^(.*?)\s+([\d,]+(?:\.\d+)?)\s+(\S+)$/);
            if (matchEnd) {
                restText = matchEnd[1].trim();
                rate = Number(matchEnd[2].replace(/,/g, ''));
                unit = matchEnd[3].trim();
            }

            currentItem = {
                code: matchStart[2],
                lines: restText ? [restText] : [],
                rate: rate,
                unit: unit
            };
        } else {
            if (currentItem) {
                currentItem.lines.push(line);
            }
        }
    });

    if (currentItem) {
        items.push(currentItem);
    }

    const processedItems = items.map(item => {
        return {
            itemCode: item.code,
            description: item.lines.join(' ').trim(),
            unit: item.unit,
            rate: item.rate
        };
    });

    return processedItems;
};

const Resizer = ({ onMouseDown }) => (
    <div onMouseDown={onMouseDown} style={{ display: 'inline-block', width: '10px', height: '100%', position: 'absolute', right: 0, top: 0, cursor: 'col-resize', zIndex: 1, backgroundColor: 'transparent', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'} onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'} />
);

export default function ViewBoqTab({ masterBoqs, regions, resources, onEditBoq, deleteMasterBoq, loadData }) {
    const [searchCode, setSearchCode] = useState('');
    const [searchDesc, setSearchDesc] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [categories, setCategories] = useState(() => {
        const saved = localStorage.getItem("custom_categories");
        const parsed = saved ? JSON.parse(saved) : [];
        return [...STATIC_CATEGORIES, ...parsed];
    });
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState(null);
    const [deleteCategoryModalOpen, setDeleteCategoryModalOpen] = useState(false);
    const [addEntryModalOpen, setAddEntryModalOpen] = useState(false);
    const [sortDirection, setSortDirection] = useState('asc');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const excelInputRef = useRef(null);

    const handleAddCategory = (newCat) => {
        const saved = localStorage.getItem("custom_categories");
        const parsed = saved ? JSON.parse(saved) : [];
        const updated = [...parsed, newCat];
        localStorage.setItem("custom_categories", JSON.stringify(updated));
        setCategories([...STATIC_CATEGORIES, ...updated]);
        setSelectedCategory(newCat);
        setPage(0);
    };

    const handleDeleteCategory = () => {
        if (!categoryToDelete) return;
        const saved = localStorage.getItem("custom_categories");
        const parsed = saved ? JSON.parse(saved) : [];
        const updated = parsed.filter(cat => cat !== categoryToDelete);
        localStorage.setItem("custom_categories", JSON.stringify(updated));
        setCategories([...STATIC_CATEGORIES, ...updated]);
        if (selectedCategory === categoryToDelete) {
            setSelectedCategory('');
            setPage(0);
        }
        setCategoryToDelete(null);
        setDeleteCategoryModalOpen(false);
    };

    const [colWidths, setColWidths] = useState({ code: 150, desc: 550, unit: 100, actions: 150 });

    const handleResizeStart = (colKey) => (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const thElement = e.target.closest('th');
        const startWidth = thElement ? thElement.getBoundingClientRect().width : colWidths[colKey];
        const handleMouseMove = (moveEvent) => setColWidths(prev => ({ ...prev, [colKey]: Math.max(50, startWidth + (moveEvent.clientX - startX)) }));
        const handleMouseUp = () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
        document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
    };

    const handleSortToggle = () => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));

    const processedBOQs = useMemo(() => {
        let filtered = masterBoqs.filter((boq) => {
            const matchCode = boq.itemCode?.toLowerCase().includes(searchCode.toLowerCase());
            const matchDesc = boq.description?.toLowerCase().includes(searchDesc.toLowerCase());

            let matchCat = true;
            if (selectedCategory) {
                const match = selectedCategory.match(/^([\d.]+)\./);
                if (match) {
                    const sectionNum = match[1];
                    const normalizedCode = (boq.itemCode || '').trim();
                    matchCat = normalizedCode.startsWith(`${sectionNum}.`) ||
                        normalizedCode === sectionNum ||
                        normalizedCode.startsWith(`0${sectionNum}.`) ||
                        normalizedCode === `0${sectionNum}`;
                }
            }
            return matchCode && matchDesc && matchCat;
        });
        filtered.sort((a, b) => {
            const codeA = a.itemCode || ''; const codeB = b.itemCode || '';
            return sortDirection === 'asc' ? codeA.localeCompare(codeB, undefined, { numeric: true }) : codeB.localeCompare(codeA, undefined, { numeric: true });
        });
        return filtered;
    }, [masterBoqs, searchCode, searchDesc, sortDirection, selectedCategory]);

    const paginatedBOQs = useMemo(() => processedBOQs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [processedBOQs, page, rowsPerPage]);

    const generateDatabookTemplate = () => {
        const wsData = [
            { "BOQ_Code": "EXAMPLE-01", "BOQ_Description": "12 mm cement plaster of mix: 1:4", "BOQ_Unit": "sqm", "Overhead_Percent": 15, "Profit_Percent": 15, "Component_Type": "boq", "Component_Code": "MIX.01", "Component_Qty": 0.0144 },
            { "BOQ_Code": "EXAMPLE-01", "BOQ_Description": "12 mm cement plaster of mix: 1:4", "BOQ_Unit": "sqm", "Overhead_Percent": 15, "Profit_Percent": 15, "Component_Type": "resource", "Component_Code": "0155", "Component_Qty": 0.067 }
        ];
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Databook Template");
        XLSX.writeFile(wb, "Databook_Upload_Template.xlsx");
    };

    const handleDatabookExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                if (jsonData.length === 0) throw new Error("Empty Excel file");

                const boqGroups = {};
                jsonData.forEach(row => {
                    const boqCode = String(row["BOQ_Code"] || "").trim();
                    if (!boqCode) return;
                    if (!boqGroups[boqCode]) boqGroups[boqCode] = { itemCode: boqCode, description: String(row["BOQ_Description"] || ""), unit: String(row["BOQ_Unit"] || "each"), overhead: Number(row["Overhead_Percent"]) || 0, profit: Number(row["Profit_Percent"]) || 0, components: [] };
                    const compType = String(row["Component_Type"] || "").toLowerCase().trim();
                    const compCode = String(row["Component_Code"] || "").trim();
                    const compQty = Number(row["Component_Qty"]) || 0;
                    if (compType && compCode && compQty > 0) boqGroups[boqCode].components.push({ tempType: compType, tempCode: compCode, qty: compQty });
                });

                let added = 0, updated = 0;
                for (const boqCode of Object.keys(boqGroups)) {
                    const group = boqGroups[boqCode];
                    const validComponents = [];
                    for (const comp of group.components) {
                        let itemId = null; let itemType = "resource";
                        if (comp.tempType === 'resource') { const res = resources.find(r => r.code === comp.tempCode); if (res) itemId = res.id; }
                        else if (comp.tempType === 'boq' || comp.tempType === 'databook_item') { const b = masterBoqs.find(b => b.itemCode === comp.tempCode); if (b) itemId = b.id; itemType = "boq"; }
                        if (itemId) validComponents.push({ itemType, itemId, qty: comp.qty, formulaStr: String(comp.qty) });
                    }
                    const payload = { ...group, components: JSON.stringify(validComponents) };
                    const existing = masterBoqs.find(b => b.itemCode === group.itemCode);
                    if (existing) { await window.api.db.saveMasterBoq(payload, existing.id, false); updated++; }
                    else { await window.api.db.saveMasterBoq(payload, null, true); added++; }
                }
                alert(`Databook Excel Processed!\n\nProcessed: ${added + updated} items`);
                loadData();
            } catch (err) { alert("Failed to parse Excel file."); }
        };
        reader.readAsArrayBuffer(file);
    };

    const pdfInputRef = useRef(null);

    const handlePdfUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = event.target.result;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();

                    const linesMap = {};
                    textContent.items.forEach(item => {
                        if (!item.str.trim()) return;
                        const y = Math.round(item.transform[5]);
                        let foundKey = Object.keys(linesMap).find(k => Math.abs(Number(k) - y) <= 5);
                        if (!foundKey) {
                            foundKey = String(y);
                            linesMap[foundKey] = [];
                        }
                        linesMap[foundKey].push(item);
                    });

                    const sortedYKeys = Object.keys(linesMap).sort((a, b) => Number(b) - Number(a));
                    const pageLines = sortedYKeys.map(yKey => {
                        const lineItems = linesMap[yKey].sort((a, b) => a.transform[4] - b.transform[4]);
                        return lineItems.map(item => item.str).join(" ");
                    });

                    fullText += pageLines.join("\n") + "\n";
                }

                // Check for required format columns
                const lowerText = fullText.toLowerCase();
                const hasRequiredHeaders = (lowerText.includes("no") || lowerText.includes("sl")) &&
                    (lowerText.includes("spec") || lowerText.includes("code")) &&
                    lowerText.includes("specification") &&
                    (lowerText.includes("rate") || lowerText.includes("price")) &&
                    (lowerText.includes("unit") || lowerText.includes("unlt"));

                if (!hasRequiredHeaders) {
                    alert("Invalid format! The PDF must contain 'No', 'Spec Code', 'Specification', 'Rate(₹)', and 'Unit' columns.");
                    return;
                }

                const parsedItems = parsePDFText(fullText);
                if (parsedItems.length === 0) {
                    alert("No valid items found in the PDF. Please check the format.");
                    return;
                }

                const resourcesToSave = [];
                const boqsToSave = [];

                parsedItems.forEach(item => {
                    const resourceId = window.crypto.randomUUID();
                    const ratesObj = {};
                    regions.forEach(r => {
                        ratesObj[r.name] = item.rate;
                    });

                    resourcesToSave.push({
                        id: resourceId,
                        code: item.itemCode,
                        description: item.description,
                        unit: item.unit,
                        rates: JSON.stringify(ratesObj),
                        rateHistory: JSON.stringify([])
                    });

                    const components = [
                        {
                            itemType: "resource",
                            itemId: resourceId,
                            qty: 1,
                            formulaStr: "1"
                        }
                    ];

                    boqsToSave.push({
                        itemCode: item.itemCode,
                        description: item.description,
                        unit: item.unit,
                        overhead: 0,
                        profit: 0,
                        components: JSON.stringify(components)
                    });
                });

                // 1. Bulk save resources
                await window.api.db.bulkSaveResources(resourcesToSave);

                // 2. Save master BOQs
                let added = 0;
                let updated = 0;
                for (const boq of boqsToSave) {
                    const existing = masterBoqs.find(b => b.itemCode === boq.itemCode);
                    if (existing) {
                        await window.api.db.saveMasterBoq(boq, existing.id, false);
                        updated++;
                    } else {
                        await window.api.db.saveMasterBoq(boq, null, true);
                        added++;
                    }
                }

                alert(`PDF Assemblies Processed!\n\nAdded: ${added}\nUpdated: ${updated}`);
                loadData();
            } catch (err) {
                console.error(err);
                alert("Failed to parse or process the PDF file.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const totalPages = Math.ceil(processedBOQs.length / rowsPerPage);
    const startEntry = processedBOQs.length === 0 ? 0 : page * rowsPerPage + 1;
    const endEntry = Math.min((page + 1) * rowsPerPage, processedBOQs.length);

    return (
        <Box sx={{ width: '100%', overflow: 'hidden' }}>
            <Typography variant="h6" fontWeight="bold" mb={3} sx={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px', fontSize: '16px' }}>DATABOOK_ASSEMBLIES</Typography>
            <Box display="flex" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
                <TextField placeholder="Search Code..." variant="outlined" size="small" value={searchCode} onChange={(e) => { setSearchCode(e.target.value); setPage(0); }} sx={{ flex: 1, minWidth: 150 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                <TextField placeholder="Search Description..." variant="outlined" size="small" value={searchDesc} onChange={(e) => { setSearchDesc(e.target.value); setPage(0); }} sx={{ flex: 2, minWidth: 250 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                
                <TextField
                    select
                    size="small"
                    label="CATEGORY"
                    value={selectedCategory}
                    onChange={(e) => { 
                        if (e.target.value === "__ADD_CATEGORY__") {
                            setCategoryModalOpen(true);
                        } else {
                            setSelectedCategory(e.target.value); 
                            setPage(0); 
                        }
                    }}
                    sx={{ flex: 1.5, minWidth: 200 }}
                    InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }}
                    InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }}
                    SelectProps={{
                        renderValue: (selected) => selected || "---select---"
                    }}
                >
                    <MenuItem value="" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>---select---</MenuItem>
                    <MenuItem value="__ADD_CATEGORY__" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#8b5cf6', fontWeight: 'bold' }}>+ Add Category</MenuItem>
                    {categories.map(cat => {
                        const isCustom = !STATIC_CATEGORIES.includes(cat);
                        return (
                            <MenuItem 
                                key={cat} 
                                value={cat} 
                                sx={{ 
                                    fontFamily: "'JetBrains Mono', monospace", 
                                    fontSize: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    width: '100%',
                                    minWidth: '240px'
                                }}
                            >
                                <span>{cat}</span>
                                {isCustom && (
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCategoryToDelete(cat);
                                            setDeleteCategoryModalOpen(true);
                                        }}
                                        sx={{ p: 0.5, ml: 2 }}
                                    >
                                        <DeleteIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                )}
                            </MenuItem>
                        );
                    })}
                </TextField>

                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap" sx={{ ml: 'auto' }}>
                    <Button size="small" variant="contained" color="secondary" disableElevation startIcon={<UploadIcon />} onClick={() => { if (!selectedCategory) { alert("Please select a category first!"); return; } pdfInputRef.current.click(); }} sx={{ height: 40, px: 3, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)', '&:hover': { background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)' } }}>UPLOAD ASSEMBLY</Button>

                    <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={generateDatabookTemplate} sx={{ height: 40, px: 3, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>TEMPLATE</Button>
                    <input type="file" accept=".xls,.xlsx" ref={excelInputRef} style={{ display: 'none' }} onChange={(e) => { handleDatabookExcelUpload(e); excelInputRef.current.value = null; }} />
                    <input type="file" accept=".pdf" ref={pdfInputRef} style={{ display: 'none' }} onChange={(e) => { handlePdfUpload(e); pdfInputRef.current.value = null; }} />
                    <Button size="small" variant="contained" disableElevation startIcon={<UploadIcon />} onClick={() => excelInputRef.current.click()} sx={{ height: 40, px: 3, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>IMPORT EXCEL</Button>

                    <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                            if (!selectedCategory) {
                                alert("Please select a category first!");
                                return;
                            }
                            setAddEntryModalOpen(true);
                        }}
                        sx={{
                            height: 40,
                            px: 3,
                            borderRadius: 2,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11px',
                            background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
                            '&:hover': { background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)' }
                        }}
                    >
                        + ADD DATABOOK ENTRY
                    </Button>
                </Box>

            </Box>

            <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ overflowX: 'auto', width: '100%', borderRadius: '8px 8px 0 0', border: '1px solid', borderColor: 'divider', borderBottom: 'none', bgcolor: 'rgba(13, 31, 60, 0.5)' }}>
                <Table size="small" sx={{ tableLayout: 'fixed', minWidth: '100%', width: Object.values(colWidths).reduce((a, b) => a + b, 0) }}>
                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>
                        <TableRow>
                            <TableCell sx={{ width: colWidths.code, position: 'relative', overflow: 'visible', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}><TableSortLabel active={true} direction={sortDirection} onClick={handleSortToggle}><strong>ITEM_CODE</strong></TableSortLabel><Resizer onMouseDown={handleResizeStart('code')} /></TableCell>
                            <TableCell sx={{ width: colWidths.desc, position: 'relative', overflow: 'visible', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}><strong>DESCRIPTION</strong><Resizer onMouseDown={handleResizeStart('desc')} /></TableCell>
                            <TableCell sx={{ width: colWidths.unit, position: 'relative', overflow: 'visible', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}><strong>UNIT</strong><Resizer onMouseDown={handleResizeStart('unit')} /></TableCell>
                            <TableCell align="center" sx={{ width: colWidths.actions, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}><strong>ACTIONS</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paginatedBOQs.length > 0 ? (
                            paginatedBOQs.map((b) => {
                                return (
                                    <TableRow key={b.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{b.itemCode || '-'}</TableCell>
                                        <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{b.description}</TableCell>
                                        <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{b.unit}</TableCell>
                                        <TableCell align="center"><Box display="flex" gap={1} justifyContent="center"><Button size="small" variant="outlined" color="warning" onClick={() => onEditBoq(b)} sx={{ borderRadius: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>EDIT</Button><Button size="small" variant="outlined" color="error" onClick={() => deleteMasterBoq(b.id, `${b.itemCode} - ${b.description}`)} sx={{ borderRadius: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>DELETE</Button></Box></TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (<TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'text.secondary' }}>NO_MATCHING_ITEMS</TableCell></TableRow>)}
                    </TableBody>
                </Table>
            </TableContainer>

            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{
                p: 2,
                bgcolor: 'rgba(13, 31, 60, 0.3)',
                border: '1px solid',
                borderColor: 'divider',
                borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2
            }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                    SHOWING {startEntry}–{endEntry} OF {processedBOQs.length} ENTRIES
                </Typography>
                <Pagination
                    count={totalPages}
                    page={page + 1}
                    onChange={(e, v) => setPage(v - 1)}
                    color="primary"
                    size="medium"
                    showFirstButton
                    showLastButton
                    sx={{
                        '& .MuiPaginationItem-root': {
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            color: 'text.secondary',
                            '&.Mui-selected': {
                                background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                                color: '#fff',
                                fontWeight: 'bold',
                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
                                '&:hover': {
                                    background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                                }
                            }
                        }
                    }}
                />
            </Box>

            <AddCategoryModal
                open={categoryModalOpen}
                onClose={() => setCategoryModalOpen(false)}
                onAddCategory={handleAddCategory}
                existingCategories={categories}
            />

            <ConfirmDeleteCategoryModal
                open={deleteCategoryModalOpen}
                onClose={() => { setCategoryToDelete(null); setDeleteCategoryModalOpen(false); }}
                onConfirm={handleDeleteCategory}
                categoryName={categoryToDelete}
            />

            <AddDatabookEntryModal
                open={addEntryModalOpen}
                onClose={() => setAddEntryModalOpen(false)}
                onSave={loadData}
                categoryPrefix={selectedCategory}
                masterBoqs={masterBoqs}
                regions={regions}
            />
        </Box>
    );
}