// ScannerView.swift
// CargoScan — Complete Scanner UI
//
// This file displays REAL measurement values from ARScannerViewModel.
// There are ZERO hardcoded dimension strings in this file.
//
// SCREENS:
//   findingFloor     → animated floor-detection prompt
//   positioning      → live distance + pitch + directional arrow
//   readyToScan      → green "Start Scan" button
//   scanning         → progress bar + live overlay + guidance arrow
//   processing       → spinner
//   completed        → real L / W / H / CBM / cost + Save button
//   manualCornerTap  → tap-4-corners instruction overlay

import SwiftUI
import ARKit
import RealityKit

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Main scanner view
// ─────────────────────────────────────────────────────────────────────────────

struct ScannerView: View {

    @StateObject private var vm = ARScannerViewModel()
    @Environment(\.dismiss) private var dismiss

    var cbmRate: Double = 85.0

    var body: some View {
        ZStack {

            // ── AR camera feed ───────────────────────────────────────────────
            ARViewContainer(viewModel: vm)
                .edgesIgnoringSafeArea(.all)
                .onTapGesture { loc in
                    vm.receiveCornerTap(loc)
                }

            // ── Box outline overlay ──────────────────────────────────────────
            if vm.overlayCorners.count == 4 {
                BoxOverlayShape(corners: vm.overlayCorners)
                    .stroke(Color.cyan.opacity(0.85), lineWidth: 2.5)
                    .ignoresSafeArea()
            }

            // ── Manual tap dots ──────────────────────────────────────────────
            if vm.phase == .manualCornerTap {
                ForEach(0 ..< vm.manualTapCorners.count, id: \.self) { i in
                    let pt = vm.manualTapCorners[i]
                    Circle()
                        .fill(Color.yellow)
                        .frame(width: 18, height: 18)
                        .overlay(Circle().stroke(Color.black, lineWidth: 1.5))
                        .position(pt)
                        .ignoresSafeArea()
                }
            }

            // ── All other UI layers ──────────────────────────────────────────
            VStack(spacing: 0) {
                topBar
                Spacer()
                bottomPanel
            }
        }
        .onAppear { vm.cbmRatePerCBM = cbmRate }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Top bar: guidance pill + distance badge
    // ─────────────────────────────────────────────────────────────────────────

    private var topBar: some View {
        HStack(alignment: .top) {

            // Guidance pill
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    // Status dot
                    Circle()
                        .fill(guidanceDotColor)
                        .frame(width: 9, height: 9)
                        .overlay(
                            Circle().fill(guidanceDotColor.opacity(0.4))
                                .frame(width: 16, height: 16)
                        )

                    // Direction arrow
                    if let sym = vm.guidance.arrowSymbol {
                        Image(systemName: sym)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(guidanceTextColor)
                    }

                    // Message
                    Text(vm.guidance.message)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                }

                // Scanning progress bar
                if vm.phase == .scanning {
                    ProgressView(value: vm.progress, total: 1.0)
                        .progressViewStyle(LinearProgressViewStyle(tint: .cyan))
                        .frame(width: 200)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 22))

            Spacer()

            // Distance + pitch badges
            VStack(alignment: .trailing, spacing: 6) {
                distanceBadge
                if vm.phase == .scanning || vm.phase == .positioning || vm.phase == .readyToScan {
                    pitchBadge
                }
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 18)
    }

    private var distanceBadge: some View {
        VStack(spacing: 1) {
            Text("DIST")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.5))
            Text(vm.distanceMetres > 0
                 ? String(format: "%.2f m", vm.distanceMetres)
                 : "—")
                .font(.system(size: 18, weight: .black, design: .monospaced))
                .foregroundColor(distanceColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 12))
    }

    private var pitchBadge: some View {
        VStack(spacing: 1) {
            Text("TILT")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.5))
            Text(String(format: "%.0f°", vm.pitchDegrees))
                .font(.system(size: 16, weight: .black, design: .monospaced))
                .foregroundColor(pitchColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 12))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Bottom panel
    // ─────────────────────────────────────────────────────────────────────────

    @ViewBuilder
    private var bottomPanel: some View {
        switch vm.phase {

        case .findingFloor:
            floorDetectionPanel

        case .positioning:
            positioningPanel

        case .readyToScan:
            readyPanel

        case .scanning:
            scanningPanel

        case .processing:
            processingPanel

        case .completed:
            if let dims = vm.finalDimensions {
                ResultPanel(dims: dims, cbmRate: cbmRate,
                            capturedImage: vm.capturedImage,
                            onSave: { /* wire to shipment API */ },
                            onRescan: { vm.resetAndRescan() })
            }

        case .manualCornerTap:
            manualTapPanel

        default:
            EmptyView()
        }
    }

    // Floor detection
    private var floorDetectionPanel: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.3.layers.3d.down.right")
                .font(.system(size: 32))
                .foregroundColor(.blue)
                .symbolEffect(.pulse)
            Text("Point camera at the floor")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
            Text("Move slowly to help ARKit detect the ground plane")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.6))
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 24)
        .padding(.bottom, 44)
    }

    // Positioning guide
    private var positioningPanel: some View {
        VStack(spacing: 10) {
            Text("Position yourself")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)

            HStack(spacing: 16) {
                PositioningIndicator(
                    label: "DISTANCE",
                    value: vm.distanceMetres > 0
                           ? String(format: "%.1f m", vm.distanceMetres) : "—",
                    target: "0.6 – 3.5 m",
                    ok: vm.distanceMetres >= 0.6 && vm.distanceMetres <= 3.5
                )
                PositioningIndicator(
                    label: "ANGLE",
                    value: String(format: "%.0f°", vm.pitchDegrees),
                    target: "−20° to −65°",
                    ok: vm.pitchDegrees <= -20 && vm.pitchDegrees >= -65
                )
            }

            Text("All indicators must be green before scanning starts")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.5))
        }
        .padding(18)
        .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 20)
        .padding(.bottom, 40)
    }

    // Ready state
    private var readyPanel: some View {
        VStack(spacing: 14) {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundColor(.green)
                Text("Perfect position — ready to scan")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
            }

            Button { vm.startScan() } label: {
                HStack(spacing: 10) {
                    Image(systemName: "camera.metering.spot")
                        .font(.system(size: 18, weight: .bold))
                    Text("Start Scan")
                        .font(.system(size: 18, weight: .bold))
                }
                .foregroundColor(.black)
                .frame(width: 240, height: 56)
                .background(Color.green, in: Capsule())
                .shadow(color: .green.opacity(0.5), radius: 12)
            }
        }
        .padding(20)
        .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    // Scanning in progress
    private var scanningPanel: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Capturing frames")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(Int(vm.progress * 100))%")
                    .font(.system(size: 14, weight: .black, design: .monospaced))
                    .foregroundColor(.cyan)
            }

            ProgressView(value: vm.progress, total: 1.0)
                .progressViewStyle(LinearProgressViewStyle(tint: .cyan))
                .frame(height: 6)

            Text("Keep the box in frame and hold still")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.55))

            // Manual corner override option
            Button {
                vm.requestManualCornerTap()
            } label: {
                Label("Tap corners manually", systemImage: "hand.tap")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.yellow.opacity(0.9))
            }
        }
        .padding(16)
        .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    // Processing spinner
    private var processingPanel: some View {
        VStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                .scaleEffect(1.4)
            Text("Calculating dimensions…")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
        }
        .padding(28)
        .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 20))
        .padding(.bottom, 44)
    }

    // Manual tap instructions
    private var manualTapPanel: some View {
        VStack(spacing: 10) {
            Text("Tap the 4 corners of the box top")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
            Text("\(vm.manualTapCorners.count) / 4 corners tapped")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.yellow)
            Text("Tap starting from the nearest corner, going clockwise")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.55))
                .multilineTextAlignment(.center)

            if vm.manualTapCorners.count > 0 {
                Button {
                    vm.manualTapCorners = []
                } label: {
                    Label("Reset corners", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.orange)
                }
            }
        }
        .padding(18)
        .background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Derived colours
    // ─────────────────────────────────────────────────────────────────────────

    private var guidanceDotColor: Color {
        vm.guidance.isGood    ? .green  :
        vm.guidance.isWarning ? .orange : .blue
    }

    private var guidanceTextColor: Color {
        vm.guidance.isGood    ? .green  :
        vm.guidance.isWarning ? .orange : .white
    }

    private var distanceColor: Color {
        let d = vm.distanceMetres
        if d <= 0       { return .white   }
        if d < 0.55     { return .red     }
        if d > 3.5      { return .orange  }
        return .green
    }

    private var pitchColor: Color {
        let p = vm.pitchDegrees
        if p > -20 || p < -68 { return .orange }
        return .green
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Result panel  (ALL values from real CargoDimensions — zero hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

private struct ResultPanel: View {

    let dims:          CargoDimensions
    let cbmRate:       Double
    let capturedImage: UIImage?
    let onSave:        () -> Void
    let onRescan:      () -> Void

    var shippingCost: Double { Double(dims.cbm) * cbmRate }

    var body: some View {
        VStack(spacing: 0) {

            // ── Confidence bar ───────────────────────────────────────────────
            confidenceHeader

            // ── Dimensions ───────────────────────────────────────────────────
            HStack(spacing: 0) {
                DimBox(label: "LENGTH", value: dims.length, unit: "cm")
                dividerLine
                DimBox(label: "WIDTH",  value: dims.width,  unit: "cm")
                dividerLine
                DimBox(label: "HEIGHT", value: dims.height, unit: "cm")
            }
            .padding(.vertical, 18)
            .background(Color.white.opacity(0.04))

            Divider().background(Color.white.opacity(0.12))

            // ── CBM + cost ───────────────────────────────────────────────────
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CBM")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                    Text(String(format: "%.4f m³", dims.cbm))
                        .font(.system(size: 22, weight: .black, design: .monospaced))
                        .foregroundColor(.cyan)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("SHIPPING COST")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                    Text(String(format: "$%.2f", shippingCost))
                        .font(.system(size: 22, weight: .black, design: .monospaced))
                        .foregroundColor(.green)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)

            Divider().background(Color.white.opacity(0.12))

            // ── Photo evidence thumbnail ─────────────────────────────────────
            if let img = capturedImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 90)
                    .clipped()
                    .overlay(
                        HStack {
                            Image(systemName: "camera.fill")
                            Text("Evidence photo captured")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(8)
                        .background(.black.opacity(0.6))
                        .padding(8),
                        alignment: .bottomLeading
                    )
            }

            // ── Action buttons ───────────────────────────────────────────────
            HStack(spacing: 12) {
                Button(action: onRescan) {
                    Label("Rescan", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Color.white.opacity(0.1),
                                    in: RoundedRectangle(cornerRadius: 12))
                }

                Button(action: onSave) {
                    Label("Save to Shipment", systemImage: "arrow.right.circle.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Color.green, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .background(Color(red: 0.07, green: 0.09, blue: 0.12)
                        .opacity(0.97),
                    in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 12)
        .padding(.bottom, 36)
    }

    private var confidenceHeader: some View {
        HStack {
            Text("MEASUREMENT RESULT")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white.opacity(0.45))
                .kerning(1.2)
            Spacer()
            // Confidence badge
            let pct = Int(dims.confidence * 100)
            let col: Color = dims.confidence >= 0.90 ? .green
                           : dims.confidence >= 0.75 ? .yellow : .orange
            HStack(spacing: 4) {
                Circle().fill(col).frame(width: 7, height: 7)
                Text("\(pct)% confidence")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(col)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }

    private var dividerLine: some View {
        Rectangle()
            .fill(Color.white.opacity(0.1))
            .frame(width: 1)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Supporting views
// ─────────────────────────────────────────────────────────────────────────────

/// One measurement dimension cell — shows a real Float value, never a string literal
private struct DimBox: View {
    let label: String
    let value: Float
    let unit:  String

    var body: some View {
        VStack(spacing: 3) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.4))
                .kerning(0.8)
            Text(String(format: "%.1f", value))
                .font(.system(size: 28, weight: .black, design: .monospaced))
                .foregroundColor(.white)
            Text(unit)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity)
    }
}

/// Two-line positioning indicator (distance or angle)
private struct PositioningIndicator: View {
    let label:  String
    let value:  String
    let target: String
    let ok:     Bool

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 5) {
                Circle()
                    .fill(ok ? Color.green : Color.orange)
                    .frame(width: 7, height: 7)
                Text(label)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white.opacity(0.5))
                    .kerning(0.8)
            }
            Text(value)
                .font(.system(size: 20, weight: .black, design: .monospaced))
                .foregroundColor(ok ? .green : .orange)
            Text(target)
                .font(.system(size: 9))
                .foregroundColor(.white.opacity(0.35))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Clean quadrilateral outline drawn over the detected box
private struct BoxOverlayShape: Shape {
    let corners: [CGPoint]

    func path(in _: CGRect) -> Path {
        guard corners.count == 4 else { return Path() }
        var p = Path()
        p.move(to: corners[0])
        p.addLine(to: corners[1])
        p.addLine(to: corners[2])
        p.addLine(to: corners[3])
        p.closeSubpath()
        return p
    }
}

/// ARView UIKit bridge
struct ARViewContainer: UIViewRepresentable {
    let viewModel: ARScannerViewModel

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        viewModel.setupSession(with: arView)
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}

/// UIVisualEffectView blur bridge
struct BlurView: UIViewRepresentable {
    let style: UIBlurEffect.Style
    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: style))
    }
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Preview
// ─────────────────────────────────────────────────────────────────────────────

#Preview {
    ScannerView(cbmRate: 85.0)
}
