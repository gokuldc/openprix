import React, { useState, useMemo, useEffect } from "react";
import ReactDOM from 'react-dom'; // 🔥 REQUIRED FOR PORTALS
import {
    Box, Typography, Button, Paper, TextField, MenuItem, Autocomplete,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, InputAdornment, Alert
} from "@mui/material";

// Icons
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';

import { tableInputStyle } from "../../styles";
import { useSettings } from '../../context/SettingsContext';

// 🔥 REACT QUERY & POINTER DND
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    useProject, useMasterBoqs, useProjectBoqs, useResources,
    useSaveProjectBoq, useUpdateProjectBoq, useDeleteProjectBoq
} from "../../hooks/useQueries";
import { useProjectCalculations } from "../../hooks/useProjectCalculations";

const CATEGORIES = [
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

// ============================================================================
// 🧩 SUB-COMPONENT 1: THE ADD FORM (Standard)
// ============================================================================
const BoqAddForm = ({ projectId, projectBoqItems, masterBoqs, saveBoqMutation }) => {
    const [addMode, setAddMode] = useState("master");
    const [searchCode, setSearchCode] = useState("");
    const [searchDesc, setSearchDesc] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [addBoqId, setAddBoqId] = useState("");
    const [addBoqQty, setAddBoqQty] = useState("");
    const [customCode, setCustomCode] = useState("");
    const [customDesc, setCustomDesc] = useState("");
    const [customUnit, setCustomUnit] = useState("cum");
    const [customRate, setCustomRate] = useState("");
    const [customQty, setCustomQty] = useState("");
    const [activePhase, setActivePhase] = useState("General");

    const availablePhases = useMemo(() => {
        const phases = new Set((projectBoqItems || []).map(item => item.phase).filter(Boolean));
        if (phases.size === 0) return ["Substructure", "Superstructure", "Finishing", "MEP", "General"];
        return Array.from(phases);
    }, [projectBoqItems]);

    const filteredMasterBoqs = useMemo(() => {
        return (masterBoqs || []).filter(b => {
            const matchCode = (b.itemCode || "").toLowerCase().includes(searchCode.toLowerCase());
            const matchDesc = (b.description || "").toLowerCase().includes(searchDesc.toLowerCase());
            
            let matchCat = true;
            if (selectedCategory) {
                const match = selectedCategory.match(/^(\d+)\./);
                if (match) {
                    const sectionNum = match[1];
                    const normalizedCode = (b.itemCode || '').trim();
                    matchCat = normalizedCode.startsWith(`${sectionNum}.`) || 
                               normalizedCode === sectionNum ||
                               normalizedCode.startsWith(`0${sectionNum}.`) ||
                               normalizedCode === `0${sectionNum}`;
                }
            }
            return matchCode && matchDesc && matchCat;
        });
    }, [masterBoqs, searchCode, searchDesc, selectedCategory]);

    const submitMaster = async () => {
        if (!addBoqId || !addBoqQty) return alert("Select an item and enter quantity.");
        await saveBoqMutation.mutateAsync({ projectId, masterBoqId: addBoqId, slNo: projectBoqItems.length + 1, formulaStr: String(addBoqQty), qty: 0, measurements: JSON.stringify([]), phase: activePhase, lockedRate: null });
        setAddBoqId(""); setAddBoqQty("");
    };

    const submitCustom = async () => {
        if (!customDesc || !customRate || !customQty) return alert("Description, Rate, and Qty required.");
        await saveBoqMutation.mutateAsync({ projectId, slNo: projectBoqItems.length + 1, isCustom: true, measurements: JSON.stringify([]), itemCode: customCode, description: customDesc, unit: customUnit, rate: Number(customRate), formulaStr: String(customQty), qty: 0, phase: activePhase });
        setCustomCode(""); setCustomDesc(""); setCustomRate(""); setCustomQty("");
    };

    return (
        <Box>
            <Box sx={{ display: "flex", flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
                <Button variant={addMode === "master" ? "contained" : "outlined"} onClick={() => setAddMode("master")} sx={{ borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>MASTER_DATABASE</Button>
                <Button variant={addMode === "custom" ? "contained" : "outlined"} onClick={() => setAddMode("custom")} color="secondary" sx={{ borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>CUSTOM_AD_HOC</Button>
            </Box>

            <Box sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 3 }}>
                {addMode === "master" ? (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', md: 'row' }}>
                            <TextField fullWidth size="small" placeholder="Search Code..." value={searchCode} onChange={e => setSearchCode(e.target.value)} sx={{ flex: 1 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <TextField fullWidth size="small" placeholder="Search Description..." value={searchDesc} onChange={e => setSearchDesc(e.target.value)} sx={{ flex: 1.5 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <TextField
                                select
                                fullWidth
                                size="small"
                                label="CATEGORY"
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                                sx={{ flex: 1.2 }}
                                InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }}
                                InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }}
                            >
                                <MenuItem value="" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>---select---</MenuItem>
                                {CATEGORIES.map(cat => (
                                    <MenuItem key={cat} value={cat} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{cat}</MenuItem>
                                ))}
                            </TextField>
                        </Box>
                        <TextField select fullWidth size="small" label="SELECT_ITEM" value={addBoqId} onChange={e => setAddBoqId(e.target.value)} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }}>
                            <MenuItem value="">-- CHOOSE_MASTER_BOQ --</MenuItem>
                            {filteredMasterBoqs.map(b => <MenuItem key={b.id} value={b.id} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', whiteSpace: 'normal' }}>{b.itemCode ? `[${b.itemCode}] ` : ''}{b.description}</MenuItem>)}
                        </TextField>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <TextField fullWidth size="small" type="text" label="QTY OR FORMULA" value={addBoqQty} onChange={e => setAddBoqQty(e.target.value)} placeholder="e.g. 50 or =#1*10" InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <Autocomplete freeSolo fullWidth options={availablePhases} value={activePhase} onChange={(_, newVal) => setActivePhase(newVal || "General")} onInputChange={(_, newVal) => setActivePhase(newVal || "General")} renderInput={(params) => <TextField {...params} size="small" label="PHASE" InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ ...params.InputProps, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />} />
                            <Button variant="contained" fullWidth onClick={submitMaster} startIcon={<AddIcon />} sx={{ height: 40, flexShrink: 0, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', width: { xs: '100%', sm: 'auto' } }}>ADD</Button>
                        </Box>
                    </Box>
                ) : (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <TextField fullWidth size="small" label="CODE" value={customCode} onChange={e => setCustomCode(e.target.value)} sx={{ flex: 1 }} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <TextField fullWidth size="small" label="DESCRIPTION" value={customDesc} onChange={e => setCustomDesc(e.target.value)} sx={{ flex: 3 }} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                        </Box>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <TextField fullWidth size="small" label="UNIT" value={customUnit} onChange={e => setCustomUnit(e.target.value)} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <TextField fullWidth size="small" type="number" label="RATE" value={customRate} onChange={e => setCustomRate(e.target.value)} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                            <TextField fullWidth size="small" type="number" label="QTY" value={customQty} onChange={e => setCustomQty(e.target.value)} InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />
                        </Box>
                        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }}>
                            <Autocomplete freeSolo fullWidth options={availablePhases} value={activePhase} onChange={(_, newVal) => setActivePhase(newVal || "General")} onInputChange={(_, newVal) => setActivePhase(newVal || "General")} renderInput={(params) => <TextField {...params} size="small" label="PHASE" InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }} InputProps={{ ...params.InputProps, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' } }} />} />
                            <Button variant="contained" color="secondary" fullWidth onClick={submitCustom} startIcon={<AddIcon />} sx={{ height: 40, flexShrink: 0, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', width: { xs: '100%', sm: 'auto' } }}>ADD_CUSTOM</Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

// ============================================================================
// 🧩 SUB-COMPONENT 2: THE ROW (WITH PORTAL & FIXED WIDTHS)
// ============================================================================
const BoqTableRow = ({ item, formatCurrency, provided, snapshot, updateBoqMutation, deleteBoq, openEditDialog, projectId }) => {
    const [localFormula, setLocalFormula] = useState(item.formulaStr !== undefined ? item.formulaStr : item.qty);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => { setLocalFormula(item.formulaStr !== undefined ? item.formulaStr : item.qty); }, [item.formulaStr, item.qty]);

    const handleBlur = () => {
        setIsFocused(false);
        if (localFormula !== item.formulaStr) {
            updateBoqMutation.mutate({ id: item.id, projectId, data: { formulaStr: localFormula } });
        }
    };

    const isFormula = String(item.formulaStr || "").trim().startsWith("=");
    const usePortal = snapshot.isDragging;

    const rowContent = (
        <TableRow
            ref={provided.innerRef}
            {...provided.draggableProps}
            style={{
                ...provided.draggableProps.style,
                // 🔥 CRITICAL: Force table layout when in portal to prevent cell collapse
                display: usePortal ? 'table' : 'table-row',
                tableLayout: 'fixed',
                width: usePortal ? '100%' : 'auto',
                maxWidth: usePortal ? '90vw' : 'none',
                zIndex: 9999
            }}
            sx={{
                bgcolor: snapshot.isDragging ? '#1a2e4c' : (item.isCustom ? 'rgba(34, 211, 238, 0.03)' : 'inherit'),
                boxShadow: snapshot.isDragging ? '0 15px 30px rgba(0,0,0,0.8)' : 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
            }}
        >
            {/* 🔥 FIXED WIDTHS: Prevents the "Twitch" during drag start */}
            <TableCell {...provided.dragHandleProps} sx={{ width: 40, p: 0, textAlign: 'center' }}><DragIndicatorIcon fontSize="small" /></TableCell>
            <TableCell sx={{ width: 60, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{item.slNo}</TableCell>
            <TableCell sx={{ width: 100, fontWeight: 'bold', color: item.isCustom ? 'secondary.main' : 'inherit', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{item.displayCode || "-"}</TableCell>
            <TableCell sx={{ minWidth: 250, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{item.displayDesc}</TableCell>
            <TableCell sx={{ width: 160 }}>
                <input
                    type="text"
                    value={item.hasMBook ? Number(item.computedQty || 0).toFixed(2) : (isFocused ? localFormula : Number(item.computedQty || 0).toFixed(2))}
                    onFocus={() => setIsFocused(true)}
                    onBlur={handleBlur}
                    onChange={e => setLocalFormula(e.target.value)}
                    disabled={item.hasMBook}
                    style={{ ...tableInputStyle, width: '100%', background: item.hasMBook ? "var(--mui-palette-action-disabledBackground)" : tableInputStyle.background }}
                />
            </TableCell>
            <TableCell sx={{ width: 80, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{item.displayUnit}</TableCell>
            <TableCell sx={{ width: 120, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{formatCurrency(Number(item.rate) || 0)}</TableCell>
            <TableCell sx={{ width: 140, fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{formatCurrency(Number(item.amount) || 0)}</TableCell>
            <TableCell align="center" sx={{ width: 100 }}>
                <Box display="flex" gap={0.5} justifyContent="center">
                    <IconButton color="warning" onClick={() => openEditDialog(item)} size="small"><EditIcon fontSize="small" /></IconButton>
                    <IconButton color="error" onClick={() => deleteBoq(item.id)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                </Box>
            </TableCell>
        </TableRow>
    );

    // 🔥 TELEPORT TO BODY: Solves the mouse offset / clipping issue
    if (usePortal) {
        return ReactDOM.createPortal(rowContent, document.body);
    }
    return rowContent;
};

// ============================================================================
// 🚀 MAIN COMPONENT
// ============================================================================
export default function BoqBuilderTab({ projectId, openEditDialog, setFormulaHelpOpen }) {
    const { formatCurrency } = useSettings();
    const { data: rawProject } = useProject(projectId);
    const { data: rawMasterBoqs = [] } = useMasterBoqs();
    const { data: rawProjectBoqs = [] } = useProjectBoqs(projectId);
    const { data: rawResources = [] } = useResources();

    const parseSafe = (str, fallback = []) => {
        if (!str) return fallback;
        if (typeof str !== 'string') return str;
        try { return JSON.parse(str); } catch { return fallback; }
    };

    const masterBoqs = useMemo(() => rawMasterBoqs.map(b => ({ ...b, components: parseSafe(b.components, []) })), [rawMasterBoqs]);
    const projectBoqItems = useMemo(() => rawProjectBoqs.map(b => ({ ...b, measurements: parseSafe(b.measurements, []) })).sort((a, b) => a.slNo - b.slNo), [rawProjectBoqs]);
    const resources = useMemo(() => rawResources.map(r => ({ ...r, rates: parseSafe(r.rates, {}), rateHistory: parseSafe(r.rateHistory, []) })), [rawResources]);

    const { renderedProjectBoq, totalAmount } = useProjectCalculations(projectBoqItems, masterBoqs, resources, rawProject);

    const saveBoqMutation = useSaveProjectBoq();
    const updateBoqMutation = useUpdateProjectBoq();
    const deleteBoqMutation = useDeleteProjectBoq();

    const groupedBoq = useMemo(() => {
        const groups = {};
        (renderedProjectBoq || []).forEach(item => {
            const phase = item.phase || "General";
            if (!groups[phase]) groups[phase] = [];
            groups[phase].push(item);
        });
        return groups;
    }, [renderedProjectBoq]);

    const handleOnDragEnd = async (result) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const movedItem = projectBoqItems.find(item => String(item.id) === draggableId);
        if (!movedItem) return;

        const remainingItems = projectBoqItems.filter(item => String(item.id) !== draggableId);
        const destPhaseItems = groupedBoq[destination.droppableId] || [];
        const targetItemInPhase = destPhaseItems.filter(i => String(i.id) !== draggableId)[destination.index];

        let insertIndex = remainingItems.length;
        if (targetItemInPhase) {
            insertIndex = remainingItems.findIndex(item => item.id === targetItemInPhase.id);
        } else {
            const lastItemInPhase = destPhaseItems.filter(i => String(i.id) !== draggableId).pop();
            if (lastItemInPhase) {
                insertIndex = remainingItems.findIndex(item => item.id === lastItemInPhase.id) + 1;
            } else {
                insertIndex = 0;
            }
        }

        movedItem.phase = destination.droppableId;
        remainingItems.splice(insertIndex, 0, movedItem);

        const updates = remainingItems.map((item, index) => {
            const data = { slNo: index + 1 };
            if (String(item.id) === draggableId) data.phase = movedItem.phase;
            return updateBoqMutation.mutateAsync({ id: item.id, projectId, data });
        });
        await Promise.all(updates);
    };

    const deleteProjectBoq = async (id) => {
        await deleteBoqMutation.mutateAsync({ id, projectId });
        const remaining = projectBoqItems.filter(item => item.id !== id).sort((a, b) => a.slNo - b.slNo);
        const updates = remaining.map((item, index) => ({ id: item.id, slNo: index + 1 }));
        await Promise.all(updates.map(u => updateBoqMutation.mutateAsync({ id: u.id, projectId, data: { slNo: u.slNo } })));
    };

    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(13, 31, 60, 0.5)' }}>
            <BoqAddForm projectId={projectId} projectBoqItems={projectBoqItems} masterBoqs={masterBoqs} saveBoqMutation={saveBoqMutation} />

            <Alert severity="info" sx={{ mb: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                <Box>💡 Drag the grip icon (⋮⋮) to reorder items or move them between phases.</Box>
            </Alert>

            <DragDropContext onDragEnd={handleOnDragEnd}>
                <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 1000, tableLayout: 'fixed' }}>
                        <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>
                            <TableRow>
                                <TableCell sx={{ width: 40 }}></TableCell>
                                <TableCell sx={{ width: 60, fontFamily: "'JetBrains Mono', monospace" }}>SL.NO</TableCell>
                                <TableCell sx={{ width: 100, fontFamily: "'JetBrains Mono', monospace" }}>CODE</TableCell>
                                <TableCell sx={{ minWidth: 250, fontFamily: "'JetBrains Mono', monospace" }}>DESCRIPTION</TableCell>
                                <TableCell sx={{ width: 160, fontFamily: "'JetBrains Mono', monospace" }}>QUANTITY</TableCell>
                                <TableCell sx={{ width: 80, fontFamily: "'JetBrains Mono', monospace" }}>UNIT</TableCell>
                                <TableCell sx={{ width: 120, fontFamily: "'JetBrains Mono', monospace" }}>UNIT_RATE</TableCell>
                                <TableCell sx={{ width: 140, fontFamily: "'JetBrains Mono', monospace" }}>TOTAL</TableCell>
                                <TableCell align="center" sx={{ width: 100 }}>ACTION</TableCell>
                            </TableRow>
                        </TableHead>

                        {Object.entries(groupedBoq).map(([phaseName, phaseItems]) => (
                            <React.Fragment key={`phase-${phaseName}`}>
                                <TableBody>
                                    <TableRow sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)' }}>
                                        <TableCell colSpan={9} sx={{ py: 1.5, borderBottom: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                            <Typography variant="subtitle2" color="primary.main" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                                ❖ PHASE: {phaseName.toUpperCase()}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>

                                <Droppable droppableId={phaseName}>
                                    {(provided) => (
                                        <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                                            {phaseItems.map((item, index) => (
                                                <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                                                    {(provided, snapshot) => (
                                                        <BoqTableRow
                                                            item={item} projectId={projectId} formatCurrency={formatCurrency}
                                                            provided={provided} snapshot={snapshot}
                                                            updateBoqMutation={updateBoqMutation} deleteBoq={deleteProjectBoq} openEditDialog={openEditDialog}
                                                        />
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </TableBody>
                                    )}
                                </Droppable>
                            </React.Fragment>
                        ))}

                        <TableBody>
                            <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.2)' }}>
                                <TableCell colSpan={7} align="right" sx={{ fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace" }}>TOTAL_ESTIMATE:</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace" }}>
                                    {formatCurrency(Number(totalAmount) || 0)}
                                </TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </TableContainer>
            </DragDropContext>
        </Paper>
    );
}