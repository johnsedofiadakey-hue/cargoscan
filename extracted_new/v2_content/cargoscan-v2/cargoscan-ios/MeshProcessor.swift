// MeshProcessor.swift
// CargoScan — kept minimal; real measurement is in MeasurementEngine.swift
//
// CargoDimensions is the single source of truth for scan results.
// MeshProcessor is a thin utility wrapper for cost calculation.

import Foundation

// CargoDimensions is defined in MeasurementEngine.swift

struct MeshProcessor {

    /// Shipping cost from CBM and per-CBM rate
    static func calculateCost(cbm: Float, ratePerCBM: Double) -> Double {
        Double(cbm) * ratePerCBM
    }
}
