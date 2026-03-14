// ScannerView.swift
// CargoScan — Production Scanner UI
//
// SCREEN FLOW:
//   findingFloor    → animated floor-detection prompt + scan reticle
//   positioning     → live DIST / TILT badges + directional arrow
//   readyToScan     → outline appears, system tries to detect object
//   objectDetected  → glowing outline + "Object detected — tap to confirm"
//   scanning        → progress bar + live outline + frame counter
//   processing      → spinner
//   completed       → full result panel at bottom (L/W/H/CBM/cost/confidence)
//   manualCornerTap → tap 4 corners overlay
//
// ALL displayed measurements come from real CargoDimensions — zero hardcoded strings.

import SwiftUI
import ARKit
import RealityKit

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Root scanner view
// ─────────────────────────────────────────────────────────────────────────────

struct ScannerView: View {

    @StateObject private var vm  = ARScannerViewModel()
    @Environment(\.dismiss) private var dismiss

    var cbmRate: Double = 85.0
    var cargoItemId: String?
    
    @State private var isSaving = false
    @State private var saveMessage = ""
    @State private var showSaveAlert = false

    /// Drives the glow pulse animation on the outline
    @State private var glowPulse = false
    /// Flash effect when object is first detected
    @State private var detectionFlash = false
    /// Track previous phase so we can fire haptic exactly once
    @State private var prevPhase: ScanPhase = .warmingUp

    var body: some View {
        ZStack {

            // ── 1. AR camera feed (full screen, no debug overlays) ────────────
            ARViewContainer(viewModel: vm)
                .edgesIgnoringSafeArea(.all)
                .onTapGesture { loc in
                    vm.receiveCornerTap(loc)
                }

            // ── 2. Screen-centre scan reticle ─────────────────────────────────
            if [ScanPhase.findingFloor, .positioning, .readyToScan]
                .contains(vm.phase) {
                GeometryReader { geo in
                    ScanReticle(active: vm.guidance.isGood)
                        .position(x: geo.size.width / 2,
                                  y: geo.size.height / 2)
                }
                .ignoresSafeArea()
            }

            // ── 3. White detection flash ──────────────────────────────────────
            if detectionFlash {
                Color.white.opacity(0.18)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }

            // ── 4. Glowing object outline ─────────────────────────────────────
            if vm.overlayCorners.count == 4,
               vm.phase != .findingFloor,
               vm.phase != .positioning {
                // Outer diffuse glow
                BoxOutlineShape(corners: vm.overlayCorners)
                    .stroke(Color.cyan.opacity(glowPulse ? 0.18 : 0.06),
                            lineWidth: 22)
                    .blur(radius: 12)
                    .ignoresSafeArea()
                // Middle glow
                BoxOutlineShape(corners: vm.overlayCorners)
                    .stroke(Color.cyan.opacity(glowPulse ? 0.55 : 0.28),
                            lineWidth: 5)
                    .blur(radius: 3.5)
                    .ignoresSafeArea()
                // Sharp crisp line
                BoxOutlineShape(corners: vm.overlayCorners)
                    .stroke(Color.cyan, lineWidth: 1.8)
                    .ignoresSafeArea()
                // Corner accent squares
                ForEach(0 ..< vm.overlayCorners.count, id: \.self) { i in
                    CornerAccent(point: vm.overlayCorners[i])
                }
            }

            // ── 5. Manual tap dots ────────────────────────────────────────────
            if vm.phase == .manualCornerTap {
                ForEach(0 ..< vm.manualTapCorners.count, id: \.self) { i in
                    let pt = vm.manualTapCorners[i]
                    ZStack {
                        Circle()
                            .fill(Color.yellow.opacity(0.85))
                            .frame(width: 20, height: 20)
                        Circle()
                            .stroke(Color.white, lineWidth: 1.5)
                            .frame(width: 20, height: 20)
                        Text("\(i + 1)")
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(.black)
                    }
                    .position(pt)
                    .ignoresSafeArea()
                }
            }

            // ── 6. UI overlays ────────────────────────────────────────────────
            VStack(spacing: 0) {
                topBar
                Spacer()
                bottomPanel
            }
        }
        .onAppear {
            vm.cbmRatePerCBM = cbmRate
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                glowPulse = true
            }
        }
        .onChange(of: vm.phase) { newPhase in
            // Fire haptic + flash exactly once when object is first detected
            if newPhase == .objectDetected && prevPhase != .objectDetected {
                triggerDetectionFeedback()
            }
            prevPhase = newPhase
        }
        .alert(isPresented: $showSaveAlert) {
            Alert(
                title: Text("Scan Status"),
                message: Text(saveMessage),
                dismissButton: .default(Text("OK")) {
                    if saveMessage == "Scan saved successfully" {
                        dismiss() // auto close after save
                    }
                }
            )
        }
    }

    // ── Haptic + flash on detection ───────────────────────────────────────────
    private func triggerDetectionFeedback() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        withAnimation(.easeOut(duration: 0.12)) { detectionFlash = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.easeIn(duration: 0.25)) { detectionFlash = false }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Top bar
    // ─────────────────────────────────────────────────────────────────────────

    private var topBar: some View {
        VStack(spacing: 8) {
            // ── Workflow step strip ───────────────────────────────────────────
            workflowSteps

            // ── Guidance pill + badges ────────────────────────────────────────
            HStack(alignment: .top, spacing: 10) {
                guidancePill
                Spacer()
                VStack(alignment: .trailing, spacing: 5) {
                    if vm.distanceMetres > 0 { distanceBadge }
                    if [ScanPhase.positioning, .readyToScan, .scanning, .objectDetected]
                        .contains(vm.phase) { tiltBadge }
                }
            }
        }
        .padding(.top, 52)
        .padding(.horizontal, 16)
    }

    /// 5-step progress strip at the very top
    private var workflowSteps: some View {
        let steps: [(String, ScanPhase)] = [
            ("Floor",    .findingFloor),
            ("Position", .positioning),
            ("Detect",   .objectDetected),
            ("Scan",     .scanning),
            ("Result",   .completed),
        ]

        let current = workflowStepIndex(vm.phase)

        return HStack(spacing: 0) {
            ForEach(0 ..< steps.count, id: \.self) { i in
                let done    = i < current
                let active  = i == current
                let (label, _) = steps[i]

                HStack(spacing: 0) {
                    // Node
                    ZStack {
                        Circle()
                            .fill(done ? Color.green : (active ? Color.cyan : Color.white.opacity(0.2)))
                            .frame(width: 22, height: 22)
                        if done {
                            Image(systemName: "checkmark")
                                .font(.system(size: 9, weight: .black))
                                .foregroundColor(.black)
                        } else {
                            Text("\(i + 1)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(active ? .black : .white.opacity(0.5))
                        }
                    }
                    // Label below (only for active)
                    if active {
                        Text(label)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.cyan)
                            .padding(.leading, 4)
                            .transition(.opacity)
                    }
                    // Connector line
                    if i < steps.count - 1 {
                        Rectangle()
                            .fill(i < current ? Color.green.opacity(0.6) : Color.white.opacity(0.15))
                            .frame(height: 1.5)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 6)
        .background(.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 14))
    }

    private func workflowStepIndex(_ phase: ScanPhase) -> Int {
        switch phase {
        case .warmingUp, .findingFloor:               return 0
        case .positioning, .readyToScan:              return 1
        case .objectDetected:                         return 2
        case .scanning, .processing, .manualCornerTap: return 3
        case .completed:                              return 4
        }
    }

    private var guidancePill: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                // Animated status dot
                ZStack {
                    Circle()
                        .fill(dotColor.opacity(0.3))
                        .frame(width: 18, height: 18)
                    Circle()
                        .fill(dotColor)
                        .frame(width: 9, height: 9)
                }

                // Arrow
                if let sym = vm.guidance.arrowSymbol {
                    Image(systemName: sym)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(dotColor)
                }

                // Message
                Text(vm.guidance.message)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Scanning progress bar
            if vm.phase == .scanning {
                HStack(spacing: 8) {
                    ProgressView(value: vm.progress, total: 1.0)
                        .progressViewStyle(LinearProgressViewStyle(tint: .cyan))
                    Text("\(Int(vm.progress * 100))%")
                        .font(.system(size: 11, weight: .black, design: .monospaced))
                        .foregroundColor(.cyan)
                        .frame(width: 36)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.black.opacity(0.80), in: RoundedRectangle(cornerRadius: 22))
        .frame(maxWidth: 260, alignment: .leading)
    }

    private var distanceBadge: some View {
        VStack(spacing: 1) {
            Text("DIST")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.5))
            Text(String(format: "%.2f m", vm.distanceMetres))
                .font(.system(size: 17, weight: .black, design: .monospaced))
                .foregroundColor(distanceColor)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 11))
    }

    private var tiltBadge: some View {
        VStack(spacing: 1) {
            Text("TILT")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.5))
            Text(String(format: "%.0f°", vm.pitchDegrees))
                .font(.system(size: 15, weight: .black, design: .monospaced))
                .foregroundColor(tiltColor)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 6)
        .background(.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 11))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Bottom panel (phase-specific)
    // ─────────────────────────────────────────────────────────────────────────

    @ViewBuilder
    private var bottomPanel: some View {
        switch vm.phase {

        case .findingFloor:
            BottomCard {
                VStack(spacing: 10) {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 28))
                        .foregroundColor(.blue)
                        .symbolEffect(.pulse)
                    Text("Point camera at the floor")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("Move slowly — ARKit needs to see the ground surface")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.55))
                        .multilineTextAlignment(.center)
                }
            }

        case .positioning:
            BottomCard {
                VStack(spacing: 12) {
                    Text("Position yourself")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white.opacity(0.7))
                    HStack(spacing: 14) {
                        PositioningGate(
                            label: "DISTANCE",
                            value: vm.distanceMetres > 0
                                   ? String(format: "%.1f m", vm.distanceMetres) : "—",
                            target: "0.6 – 3.5 m",
                            ok: vm.distanceMetres >= 0.6 && vm.distanceMetres <= 3.5
                        )
                        PositioningGate(
                            label: "TILT ANGLE",
                            value: String(format: "%.0f°", vm.pitchDegrees),
                            target: "−20° to −65°",
                            ok: vm.pitchDegrees <= -20 && vm.pitchDegrees >= -65
                        )
                    }
                    Text("Both must be green before scanning begins")
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.4))
                }
            }

        case .readyToScan:
            BottomCard {
                VStack(spacing: 14) {
                    HStack(spacing: 6) {
                        Image(systemName: "viewfinder.circle.fill")
                            .foregroundColor(.cyan)
                            .font(.system(size: 18))
                        Text("Detecting object…")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    Text("Keep the cargo top surface centred in the viewfinder")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.55))
                        .multilineTextAlignment(.center)
                }
            }

        // ── CONFIRMATION STEP ─────────────────────────────────────────────────
        case .objectDetected:
            BottomCard {
                VStack(spacing: 14) {
                    // Header
                    HStack(spacing: 8) {
                        Image(systemName: "cube.transparent.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.cyan)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Object detected")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundColor(.white)
                            Text("Tap to confirm measurement")
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.6))
                        }
                        Spacer()
                    }

                    // Action buttons
                    HStack(spacing: 10) {
                        // Rescan
                        Button { vm.cancelToPositioning() } label: {
                            Label("Rescan", systemImage: "arrow.counterclockwise")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(Color.white.opacity(0.1),
                                            in: RoundedRectangle(cornerRadius: 10))
                        }

                        // Confirm — primary action
                        Button { vm.confirmObject() } label: {
                            Label("Confirm Object", systemImage: "checkmark.circle.fill")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.black)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(Color.cyan, in: RoundedRectangle(cornerRadius: 10))
                        }
                    }

                    // Cancel
                    Button { dismiss() } label: {
                        Text("Cancel")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.4))
                    }
                }
            }

        case .scanning:
            BottomCard {
                VStack(spacing: 8) {
                    HStack {
                        Text("Measuring")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.7))
                        Spacer()
                        Text("\(Int(vm.progress * 100))%")
                            .font(.system(size: 14, weight: .black, design: .monospaced))
                            .foregroundColor(.cyan)
                    }
                    ProgressView(value: vm.progress, total: 1.0)
                        .progressViewStyle(LinearProgressViewStyle(tint: .cyan))
                        .frame(height: 5)
                    Text("Hold still — capturing \(Int(vm.progress * 10))/10 frames")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.45))

                    // Manual corner override
                    Button { vm.requestManualCornerTap() } label: {
                        Label("Tap corners manually instead", systemImage: "hand.tap")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.yellow.opacity(0.8))
                    }
                    .padding(.top, 4)
                }
            }

        case .processing:
            BottomCard {
                HStack(spacing: 14) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                        .scaleEffect(1.3)
                    Text("Calculating dimensions…")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                }
                .padding(.vertical, 6)
            }

        case .completed:
            if let dims = vm.finalDimensions {
                ResultPanel(
                    dims:           dims,
                    cbmRate:        cbmRate,
                    capturedImage:  vm.capturedImage,
                    edgeFusion:     vm.edgeFusionActive,
                    cargoItemId:    cargoItemId,
                    isSaving:       isSaving,
                    onSave:         { saveToBackend(dims: dims) },
                    onRescan:       { vm.resetAndRescan() }
                )
            }

        case .manualCornerTap:
            BottomCard {
                VStack(spacing: 8) {
                    Text("Tap the 4 corners of the box top")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                    Text("\(vm.manualTapCorners.count) / 4 tapped")
                        .font(.system(size: 13, weight: .black, design: .monospaced))
                        .foregroundColor(.yellow)
                    Text("Start nearest corner → go clockwise")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.5))
                    if !vm.manualTapCorners.isEmpty {
                        Button { vm.manualTapCorners = [] } label: {
                            Label("Reset", systemImage: "arrow.counterclockwise")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.orange)
                        }
                    }
                }
            }

        default:
            EmptyView()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Derived colours
    // ─────────────────────────────────────────────────────────────────────────

    private var dotColor: Color {
        vm.guidance.isGood    ? .green  :
        vm.guidance.isWarning ? .orange : .systemBlue
    }

    private var distanceColor: Color {
        let d = vm.distanceMetres
        if d < 0.55 { return .red    }
        if d > 3.5  { return .orange }
        return .green
    }

    private var tiltColor: Color {
        (vm.pitchDegrees <= -20 && vm.pitchDegrees >= -68) ? .green : .orange
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Network API Integration
    // ─────────────────────────────────────────────────────────────────────────
    
    private func saveToBackend(dims: CargoDimensions) {
        guard let itemId = cargoItemId else { return }
        isSaving = true
        
        let payload = ScanPayload(
            cargoItemId: itemId,
            length: dims.length,
            width: dims.width,
            height: dims.height,
            cbm: dims.cbm,
            confidence: Float(dims.confidence),
            scannerDevice: "iPhone LiDAR",
            photoUrl: nil
        )
        
        Task {
            do {
                let msg = try await NetworkService.shared.saveScanWithRetries(payload: payload)
                await MainActor.run {
                    self.isSaving = false
                    self.saveMessage = msg
                    self.showSaveAlert = true
                }
            } catch let err as NetworkError {
                await MainActor.run {
                    self.isSaving = false
                    switch err {
                    case .serverError(let string): self.saveMessage = "Server Error: \(string)"
                    case .invalidURL: self.saveMessage = "Invalid API URL"
                    default: self.saveMessage = "Network failed."
                    }
                    self.showSaveAlert = true
                }
            } catch {
                await MainActor.run {
                    self.isSaving = false
                    self.saveMessage = "Error: \(error.localizedDescription)"
                    self.showSaveAlert = true
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Result panel  (zero hardcoded values — all from CargoDimensions)
// ─────────────────────────────────────────────────────────────────────────────

private struct ResultPanel: View {

    let dims:          CargoDimensions
    let cbmRate:       Double
    let capturedImage: UIImage?
    let edgeFusion:    Bool
    let cargoItemId:   String?
    let isSaving:      Bool
    let onSave:        () -> Void
    let onRescan:      () -> Void

    var cost: Double { Double(dims.cbm) * cbmRate }

    var body: some View {
        VStack(spacing: 0) {

            // Confidence header
            HStack {
                Text("MEASUREMENT RESULT")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.4))
                    .kerning(1.2)
                Spacer()
                HStack(spacing: 6) {
                    // Edge fusion badge
                    if edgeFusion {
                        HStack(spacing: 3) {
                            Image(systemName: "camera.filters")
                                .font(.system(size: 9, weight: .semibold))
                            Text("Hybrid")
                                .font(.system(size: 9, weight: .bold))
                        }
                        .foregroundColor(.purple)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color.purple.opacity(0.15),
                                    in: Capsule())
                    }
                    // Confidence badge
                    let pct = Int(dims.confidence * 100)
                    let col: Color = dims.confidence >= 0.90 ? .green
                                   : dims.confidence >= 0.75 ? .yellow : .orange
                    HStack(spacing: 4) {
                        Circle().fill(col).frame(width: 7, height: 7)
                        Text("Scan Confidence: \(pct)%")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(col)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 6)

            // L / W / H cells
            HStack(spacing: 0) {
                DimCell(label: "LENGTH", value: dims.length)
                Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
                DimCell(label: "WIDTH",  value: dims.width)
                Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
                DimCell(label: "HEIGHT", value: dims.height)
            }
            .padding(.vertical, 16)
            .background(Color.white.opacity(0.03))

            Divider().background(Color.white.opacity(0.1))

            // CBM + cost
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CBM")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.45))
                    Text(String(format: "%.4f m³", dims.cbm))
                        .font(.system(size: 20, weight: .black, design: .monospaced))
                        .foregroundColor(.cyan)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("SHIPPING COST")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.45))
                    Text(String(format: "$%.2f", cost))
                        .font(.system(size: 20, weight: .black, design: .monospaced))
                        .foregroundColor(.green)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Evidence photo thumbnail
            if let img = capturedImage {
                Divider().background(Color.white.opacity(0.1))
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 80)
                    .clipped()
                    .overlay(
                        HStack(spacing: 4) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 10))
                            Text("Evidence photo")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(6)
                        .background(.black.opacity(0.65))
                        .padding(8),
                        alignment: .bottomLeading
                    )
            }

            Divider().background(Color.white.opacity(0.1))

            // Action buttons
            HStack(spacing: 10) {
                Button(action: onRescan) {
                    Label("Rescan", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(Color.white.opacity(0.09),
                                    in: RoundedRectangle(cornerRadius: 10))
                }
                
                if cargoItemId != nil {
                    Button(action: onSave) {
                        if isSaving {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .black))
                        } else {
                            Label("Save to Shipment", systemImage: "arrow.right.circle.fill")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.black)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(Color.green, in: RoundedRectangle(cornerRadius: 10))
                    .disabled(isSaving)
                }
            }
            .padding(14)
        }
        .background(
            Color(red: 0.07, green: 0.09, blue: 0.13).opacity(0.97),
            in: RoundedRectangle(cornerRadius: 22)
        )
        .padding(.horizontal, 10)
        .padding(.bottom, 32)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Supporting views
// ─────────────────────────────────────────────────────────────────────────────

/// Card container that wraps all bottom panels
private struct BottomCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack { content }
            .padding(18)
            .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
    }
}

/// Real dimension cell — Float value only, no hardcoded strings
private struct DimCell: View {
    let label: String
    let value: Float

    var body: some View {
        VStack(spacing: 3) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.38))
                .kerning(0.8)
            Text(String(format: "%.1f", value))
                .font(.system(size: 26, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.7)
            Text("cm")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.45))
        }
        .frame(maxWidth: .infinity)
    }
}

/// Two-value gate indicator (distance / angle)
private struct PositioningGate: View {
    let label:  String
    let value:  String
    let target: String
    let ok:     Bool

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Circle()
                    .fill(ok ? Color.green : Color.orange)
                    .frame(width: 7, height: 7)
                Text(label)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white.opacity(0.5))
                    .kerning(0.7)
            }
            Text(value)
                .font(.system(size: 18, weight: .black, design: .monospaced))
                .foregroundColor(ok ? .green : .orange)
            Text(target)
                .font(.system(size: 9))
                .foregroundColor(.white.opacity(0.3))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Glowing quadrilateral object outline
private struct BoxOutlineShape: Shape {
    let corners: [CGPoint]
    func path(in _: CGRect) -> Path {
        guard corners.count == 4 else { return Path() }
        var p = Path()
        p.move(to: corners[0])
        for c in corners.dropFirst() { p.addLine(to: c) }
        p.closeSubpath()
        return p
    }
}

/// Small corner accent squares at each box corner
private struct CornerAccent: View {
    let point: CGPoint
    var body: some View {
        Rectangle()
            .fill(Color.cyan)
            .frame(width: 8, height: 8)
            .position(point)
            .ignoresSafeArea()
    }
}

/// Crosshair / targeting reticle drawn in screen centre during positioning
private struct ScanReticle: View {
    let active: Bool    // green when conditions met

    var body: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(active ? Color.green.opacity(0.6) : Color.white.opacity(0.3),
                        lineWidth: 1)
                .frame(width: 80, height: 80)

            // Inner ring
            Circle()
                .stroke(active ? Color.green : Color.white.opacity(0.5),
                        lineWidth: 1.5)
                .frame(width: 32, height: 32)

            // Crosshair arms
            let armLen: CGFloat = 14
            let gap:    CGFloat = 8
            let col = active ? Color.green : Color.white.opacity(0.6)

            Path { p in
                // top
                p.move(to: CGPoint(x: 0, y: -(gap + armLen)))
                p.addLine(to: CGPoint(x: 0, y: -gap))
                // bottom
                p.move(to: CGPoint(x: 0, y: gap))
                p.addLine(to: CGPoint(x: 0, y: gap + armLen))
                // left
                p.move(to: CGPoint(x: -(gap + armLen), y: 0))
                p.addLine(to: CGPoint(x: -gap, y: 0))
                // right
                p.move(to: CGPoint(x: gap, y: 0))
                p.addLine(to: CGPoint(x: gap + armLen, y: 0))
            }
            .stroke(col, lineWidth: 1.5)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - SwiftUI / UIKit bridges
// ─────────────────────────────────────────────────────────────────────────────

struct ARViewContainer: UIViewRepresentable {
    let viewModel: ARScannerViewModel
    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        viewModel.setupSession(with: arView)
        return arView
    }
    func updateUIView(_ uiView: ARView, context: Context) {}
}

struct BlurView: UIViewRepresentable {
    let style: UIBlurEffect.Style
    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: style))
    }
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Color extension
// ─────────────────────────────────────────────────────────────────────────────

extension Color {
    static let systemBlue = Color(UIColor.systemBlue)
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Preview
// ─────────────────────────────────────────────────────────────────────────────

#Preview {
    ScannerView(cbmRate: 85.0)
}
