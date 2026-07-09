import React, { useState, useMemo } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Switch, FormControlLabel, Select, MenuItem, TextField, Button
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { tableInputActiveStyle } from '../../styles';
import { getResourceRate } from '../../engines/calculationEngine';
import { useSettings } from '../../context/SettingsContext';
import { exportResourceTrackerPdf } from '../../utils/exportPdf';

export default function ResourceTrackerTab({ project, renderedProjectBoq, resources, regions = [], updateProject }) {
    const { formatCurrency } = useSettings();

    const [selectedRegion, setSelectedRegion] = useState(project?.region || "");

    // Safely parse tracking mode
    const trackingMode = project?.resourceTrackingMode || 'manual';

    const toggleMode = async () => {
        await updateProject("resourceTrackingMode", trackingMode === 'manual' ? 'auto' : 'manual');
    };

    // Safely parse daily logs to ensure we don't try to loop over a string
    const safeDailyLogs = useMemo(() => {
        if (!project?.dailyLogs) return [];
        if (typeof project.dailyLogs === 'string') {
            try { return JSON.parse(project.dailyLogs); } catch { return []; }
        }
        return project.dailyLogs;
    }, [project?.dailyLogs]);

    const autoActuals = useMemo(() => {
        const totals = {};
        safeDailyLogs.forEach(log => {
            if (!log.resourceId) return; // Skip invalid logs
            const key = `${log.phase || 'General'}_${log.resourceId}`;
            totals[key] = (totals[key] || 0) + Number(log.qty || 0);
        });
        return totals;
    }, [safeDailyLogs]);

    // Parse actual resources and selected brands from actualResources JSON string
    const { manualActuals, selectedBrands } = useMemo(() => {
        let actuals = {};
        let brands = {};
        if (typeof project?.actualResources === 'string') {
            try { 
                const parsed = JSON.parse(project.actualResources); 
                Object.entries(parsed).forEach(([k, v]) => {
                    if (k.startsWith('brand_')) {
                        brands[k.substring(6)] = v;
                    } else {
                        actuals[k] = v;
                    }
                });
            } catch { }
        } else if (project?.actualResources) {
            Object.entries(project.actualResources).forEach(([k, v]) => {
                if (k.startsWith('brand_')) {
                    brands[k.substring(6)] = v;
                } else {
                    actuals[k] = v;
                }
            });
        }
        return { manualActuals: actuals, selectedBrands: brands };
    }, [project?.actualResources]);

    const resourceTracker = useMemo(() => {
        const tracker = {};
        
        // Pass 1: Add all estimated resources from the BOQ recipes
        renderedProjectBoq.forEach(item => {
            const phase = item.phase || "General";
            if (!tracker[phase]) tracker[phase] = {};

            if (item.masterBoq && item.masterBoq.components) {
                const components = typeof item.masterBoq.components === 'string' 
                    ? JSON.parse(item.masterBoq.components) 
                    : item.masterBoq.components;

                components.forEach(comp => {
                    if (comp.itemType === 'resource') {
                        const resId = comp.itemId;
                        const resourceData = resources.find(r => r.id === resId);

                        if (resourceData) {
                            const totalRequired = Number(comp.qty) * Number(item.computedQty || 0);

                            if (!tracker[phase][resId]) {
                                tracker[phase][resId] = {
                                    code: resourceData.code,
                                    description: resourceData.description,
                                    unit: resourceData.unit,
                                    estimatedQty: 0,
                                    actualQty: trackingMode === 'auto' ? (autoActuals[`${phase}_${resId}`] || 0) : (manualActuals[`${phase}_${resId}`] || 0),
                                    resourceData: resourceData
                                };
                            }
                            tracker[phase][resId].estimatedQty += totalRequired;
                        }
                    }
                });
            }
        });

        // Pass 2: Inject any custom resources added via Daily Logs that were NOT in the BOQ
        safeDailyLogs.forEach(log => {
            if (!log.resourceId) return;
            const phase = log.phase || "General";
            const resId = log.resourceId;
            if (!tracker[phase]) tracker[phase] = {};

            if (!tracker[phase][resId]) {
                const resourceData = resources.find(r => r.id === resId);
                if (resourceData) {
                    tracker[phase][resId] = {
                        code: resourceData.code,
                        description: resourceData.description,
                        unit: resourceData.unit,
                        estimatedQty: 0, // Zero estimate because it was not in the original BOQ
                        actualQty: trackingMode === 'auto' ? (autoActuals[`${phase}_${resId}`] || 0) : (manualActuals[`${phase}_${resId}`] || 0),
                        resourceData: resourceData
                    };
                }
            }
        });

        return tracker;
    }, [renderedProjectBoq, resources, manualActuals, trackingMode, autoActuals, safeDailyLogs]);

    const updateActualResource = async (phase, resourceId, val) => {
        if (trackingMode === 'auto') return;
        
        let currentActuals = {};
        if (typeof project?.actualResources === 'string') {
            try { currentActuals = JSON.parse(project.actualResources); } catch { }
        } else if (project?.actualResources) {
            currentActuals = { ...project.actualResources };
        }

        currentActuals[`${phase}_${resourceId}`] = Number(val);
        await updateProject("actualResources", currentActuals);
    };

    const updateSelectedBrand = async (phase, resourceId, brandName) => {
        let currentActuals = {};
        if (typeof project?.actualResources === 'string') {
            try { currentActuals = JSON.parse(project.actualResources); } catch { }
        } else if (project?.actualResources) {
            currentActuals = { ...project.actualResources };
        }

        if (brandName) {
            currentActuals[`brand_${phase}_${resourceId}`] = brandName;
        } else {
            delete currentActuals[`brand_${phase}_${resourceId}`];
        }
        await updateProject("actualResources", currentActuals);
    };

    // Extract unique brands for a resource across history
    const getResourceBrands = (resource) => {
        if (!resource || !resource.rates) return [];
        let ratesObj = resource.rates;
        if (typeof ratesObj === 'string') {
            try { ratesObj = JSON.parse(ratesObj); } catch { return []; }
        }
        const history = ratesObj.brandRatesHistory || {};
        const allBrands = new Set();
        Object.values(history).forEach(monthData => {
            if (Array.isArray(monthData)) {
                monthData.forEach(item => {
                    if (item.brand) allBrands.add(item.brand);
                });
            }
        });
        return Array.from(allBrands);
    };

    // Calculate selected rate (brand or region-wise general rate)
    const getSelectedRate = (resource, brandName, regionName) => {
        if (!resource) return 0;
        let ratesObj = resource.rates;
        if (typeof ratesObj === 'string') {
            try { ratesObj = JSON.parse(ratesObj); } catch { return 0; }
        }

        if (brandName) {
            const history = ratesObj.brandRatesHistory || {};
            const sortedMonths = Object.keys(history).sort().reverse();
            for (const month of sortedMonths) {
                const monthData = history[month];
                if (Array.isArray(monthData)) {
                    const brandData = monthData.find(b => b.brand === brandName);
                    if (brandData) {
                        if (regionName && brandData[regionName] !== undefined && brandData[regionName] !== "") {
                            const rate = Number(brandData[regionName]);
                            if (rate > 0) return rate;
                        }
                        const availableBrandRates = Object.entries(brandData)
                            .filter(([k, v]) => k !== 'brand' && !isNaN(Number(v)) && Number(v) > 0)
                            .map(([k, v]) => Number(v));
                        if (availableBrandRates.length > 0) return availableBrandRates[0];
                    }
                }
            }
        }

        return getResourceRate(resource, regionName);
    };

    if (Object.keys(resourceTracker).length === 0) {
        return (
            <Paper sx={{ p: 4, textAlign: "center", borderRadius: 2, bgcolor: 'rgba(13, 31, 60, 0.5)' }}>
                <Typography color="text.secondary" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    No resources found. Add Databook Items to the BOQ or submit Daily Logs first.
                </Typography>
            </Paper>
        );
    }

    return (
        <Box display="flex" flexDirection="column" gap={4}>
            {/* MODE TOGGLE BANNER */}
            <Paper sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(13, 31, 60, 0.5)', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        TRACKING_MODE: {trackingMode.toUpperCase()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                        {trackingMode === 'auto'
                            ? "Actual quantities are automatically synced from the Daily Site Logs."
                            : "Actual quantities are entered manually in the table below."}
                    </Typography>
                </Box>
                
                {/* REGION SELECTION DROPDOWN */}
                <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
                    <TextField
                        select
                        size="small"
                        label="VIEW REGION"
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        sx={{ 
                            minWidth: 160, 
                            fontFamily: "'JetBrains Mono', monospace",
                            '& .MuiInputBase-input': { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }
                        }}
                        InputLabelProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' } }}
                    >
                        <MenuItem value="" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                            <em>-- Default ({project?.region || 'None'}) --</em>
                        </MenuItem>
                        {regions.map(r => (
                            <MenuItem key={r.id} value={r.name} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                                {r.name}
                            </MenuItem>
                        ))}
                    </TextField>

                    <FormControlLabel
                        control={<Switch checked={trackingMode === 'auto'} onChange={toggleMode} color="success" />}
                        label={<Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 'bold' }}>AUTO_SYNC</Typography>}
                        labelPlacement="start"
                    />
                </Box>
            </Paper>

            {Object.keys(resourceTracker).map(phase => (
                <Paper key={phase} elevation={0} sx={{ overflow: "hidden", borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(13, 31, 60, 0.5)' }}>
                    <Box sx={{ bgcolor: "rgba(0,0,0,0.2)", p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Typography variant="subtitle1" fontWeight="bold" sx={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>
                            PHASE: {phase.toUpperCase()}
                        </Typography>
                    </Box>
                    <TableContainer>
                        <Table size="small">
                            <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.2)' }}>
                                <TableRow sx={{ '& th': { px: 1, py: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>CODE</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>RESOURCE_DESCRIPTION</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>UNIT</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'primary.main' }}>BRAND</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'primary.main' }}>RATE</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'info.main' }}>ESTIMATED_QTY</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: trackingMode === 'auto' ? 'success.main' : 'warning.main' }}>ACTUAL_CONSUMED</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>VARIANCE</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'success.main' }}>ESTIMATED_COST</TableCell>
                                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'success.main' }}>ACTUAL_COST</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {Object.entries(resourceTracker[phase]).map(([resId, data]) => {
                                    const resourceObj = data.resourceData;
                                    const selectedBrand = selectedBrands[`${phase}_${resId}`] || "";
                                    const availableBrands = getResourceBrands(resourceObj);
                                    const activeRegionName = selectedRegion || project?.region || "";
                                    const rate = getSelectedRate(resourceObj, selectedBrand, activeRegionName);
                                    const variance = data.estimatedQty - data.actualQty;
                                    const estCost = data.estimatedQty * rate;
                                    const actualCost = data.actualQty * rate;

                                    return (
                                        <TableRow key={resId} sx={{ '& td': { px: 1, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.05)' } }}>
                                            <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{data.code}</TableCell>
                                            <TableCell sx={{ 
                                                fontFamily: "'JetBrains Mono', monospace", 
                                                fontSize: '12px',
                                                maxWidth: '180px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }} title={data.description}>
                                                {data.description}
                                                {data.estimatedQty === 0 && <Typography component="span" variant="caption" color="error.main" ml={0.5} sx={{ fontSize: '9px' }}>(Unplanned)</Typography>}
                                            </TableCell>
                                            <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{data.unit}</TableCell>
                                            <TableCell>
                                                <Select
                                                    size="small"
                                                    value={selectedBrand}
                                                    onChange={(e) => updateSelectedBrand(phase, resId, e.target.value)}
                                                    displayEmpty
                                                    sx={{ 
                                                        fontFamily: "'JetBrains Mono', monospace", 
                                                        fontSize: '11px', 
                                                        minWidth: 100,
                                                        height: 26,
                                                        bgcolor: 'rgba(255,255,255,0.03)'
                                                    }}
                                                >
                                                    <MenuItem value="" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                                                        <em>General</em>
                                                    </MenuItem>
                                                    {availableBrands.map(b => (
                                                        <MenuItem key={b} value={b} sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                                                            {b}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </TableCell>
                                            <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: selectedBrand ? 'primary.main' : 'inherit' }}>
                                                {Number(rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{data.estimatedQty.toFixed(2)}</TableCell>
                                            <TableCell>
                                                {trackingMode === 'auto' ? (
                                                    <Typography sx={{ fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', px: 0.5 }}>
                                                        {data.actualQty.toFixed(2)}
                                                    </Typography>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        value={data.actualQty || ""}
                                                        onChange={(e) => updateActualResource(phase, resId, e.target.value)}
                                                        style={{ ...tableInputActiveStyle, padding: '2px 4px', fontSize: '12px' }}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', color: variance < 0 ? 'error.main' : 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                                                {variance > 0 ? "+" : ""}{variance.toFixed(2)}
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                                                {Number(estCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                                                {Number(actualCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            ))}
        </Box>
    );
}