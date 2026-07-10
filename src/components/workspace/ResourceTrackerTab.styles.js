export const getResourceTrackerTabStyles = (theme) => ({
    // Empty state
    noResourcesPaper: { p: 4, textAlign: "center", borderRadius: 2, bgcolor: 'rgba(13, 31, 60, 0.5)' },
    noResourcesText: { fontFamily: "'JetBrains Mono', monospace" },

    // Top Banner
    toggleBannerPaper: { p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(13, 31, 60, 0.5)', flexWrap: 'wrap', gap: 2 },
    toggleTitle: { fontFamily: "'JetBrains Mono', monospace" },
    toggleDesc: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' },
    switchLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 'bold' },

    // Phase Tables
    phasePaper: { overflow: "hidden", borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(13, 31, 60, 0.5)' },
    phaseHeaderBox: { bgcolor: "rgba(0,0,0,0.2)", p: 2, borderBottom: "1px solid", borderColor: "divider" },
    phaseTitle: { fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' },
    
    // Table Headers
    tableHead: { bgcolor: 'rgba(0,0,0,0.2)' },
    thRow: { '& th': { px: 1, py: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' } },
    thCell: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' },
    thCellBrand: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'primary.main' },
    thCellRate: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'primary.main' },
    thCellEstQty: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'info.main' },
    thCellActQty: (trackingMode) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: trackingMode === 'auto' ? 'success.main' : 'warning.main' }),
    thCellCost: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'success.main' },

    // Table Body
    tbRow: { '& td': { px: 1, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.05)' } },
    tdCell: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' },
    tdCellDesc: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    unplannedText: { fontSize: '9px' },
    
    brandSelect: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', minWidth: 100, height: 26, bgcolor: 'rgba(255,255,255,0.03)' },
    brandMenuItem: { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' },
    
    tdCellRateVal: (selectedBrand) => ({ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: selectedBrand ? 'primary.main' : 'inherit' }),
    tdCellEstQtyVal: { fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' },
    tdCellActQtyAuto: { fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', px: 0.5 },
    tdCellVariance: (variance) => ({ fontWeight: 'bold', color: variance < 0 ? 'error.main' : 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }),
    tdCellCostVal: { fontWeight: 'bold', color: 'success.main', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }
});

export const getNativeStyles = (tableInputActiveStyle) => ({
    actualQtyInput: { 
        ...tableInputActiveStyle, 
        padding: '2px 4px', 
        fontSize: '12px' 
    }
});
