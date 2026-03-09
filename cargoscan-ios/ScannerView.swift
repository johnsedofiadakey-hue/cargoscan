import SwiftUI
import ARKit
import RealityKit

struct ScannerView: View {
    @StateObject private var viewModel = ARScannerViewModel()

    var body: some View {
        ZStack {
            ARViewContainer(viewModel: viewModel)
                .edgesIgnoringSafeArea(.all)

            OutlineOverlay(points: viewModel.outlinePoints)
                .allowsHitTesting(false)

            VStack {
                topStatus
                    .padding(.top, 50)
                    .padding(.horizontal, 20)

                modeControls
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                Spacer()

                bottomPanel
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
            }
        }
    }

    private var topStatus: some View {
        Text(viewModel.aiMessage)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.black.opacity(0.75), in: Capsule())
    }

    private var modeControls: some View {
        VStack(spacing: 10) {
            Picker("Scanner Mode", selection: Binding(get: {
                viewModel.scannerMode
            }, set: { mode in
                viewModel.setMode(mode)
            })) {
                Text("Linked Scan").tag(ScannerMode.linked)
                Text("Quick Scan").tag(ScannerMode.quick)
            }
            .pickerStyle(.segmented)

            if viewModel.scannerMode == .linked {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        TextField("Tracking Number", text: $viewModel.trackingNumber)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(10)
                            .background(Color.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundColor(.white)

                        Button(action: { viewModel.lookupLinkedPackage() }) {
                            Text("Find")
                                .font(.system(size: 14, weight: .bold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
                                .foregroundColor(.white)
                        }
                    }

                    TextField("Operator ID", text: $viewModel.operatorID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(10)
                        .background(Color.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 10))
                        .foregroundColor(.white)

                    if let summary = viewModel.linkedPackageSummary {
                        Text("Package: \(summary)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.green)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var bottomPanel: some View {
        VStack(spacing: 12) {
            if viewModel.phase == .ready {
                Button(action: { viewModel.confirmMeasurement() }) {
                    Text(viewModel.objectDetected ? "Object detected. Tap to confirm measurement" : "Align camera to detect object")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(viewModel.objectDetected ? Color.blue : Color.gray)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(!viewModel.objectDetected)
            }

            if viewModel.phase == .scanning || viewModel.phase == .processing {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Stabilizing Multi-frame Scan")
                        Spacer()
                        Text("\(Int(viewModel.progress * 100))%")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))

                    ProgressView(value: viewModel.progress, total: 1)
                        .tint(.green)

                    HStack {
                        Text("Vision Edge Confidence")
                        Spacer()
                        Text("\(Int(viewModel.edgeConfidence * 100))%")
                            .foregroundColor(.green)
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                }
                .padding(14)
                .background(Color.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 14))
            }

            if viewModel.phase == .completed, let dimensions = viewModel.measuredDimensions {
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        MetricChip(label: "Length", value: dimensions.length, unit: "cm")
                        MetricChip(label: "Width", value: dimensions.width, unit: "cm")
                        MetricChip(label: "Height", value: dimensions.height, unit: "cm")
                    }

                    HStack {
                        Text("CBM")
                        Spacer()
                        Text(String(format: "%.4f", dimensions.cbm))
                            .fontWeight(.bold)
                    }
                    .foregroundColor(.white)

                    HStack {
                        Text("Confidence Score")
                        Spacer()
                        Text("\(Int(viewModel.confidenceScore * 100))%")
                            .fontWeight(.bold)
                            .foregroundColor(.green)
                    }
                    .foregroundColor(.white)

                    HStack {
                        Text("Sync")
                        Spacer()
                        Text(viewModel.syncStatusMessage)
                            .fontWeight(.semibold)
                            .foregroundColor(viewModel.pendingSyncCount == 0 ? .green : .orange)
                    }
                    .foregroundColor(.white)

                    if viewModel.pendingSyncCount > 0 {
                        HStack {
                            Text("Queued")
                            Spacer()
                            Text("\(viewModel.pendingSyncCount)")
                                .fontWeight(.bold)
                                .foregroundColor(.orange)
                        }
                        .foregroundColor(.white)

                        Button(action: {
                            Task { await viewModel.retryPendingSync() }
                        }) {
                            Text("Retry Sync")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 42)
                                .background(Color.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }

                    Button(action: { viewModel.resetForRescan() }) {
                        Text("Rescan")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Color.green)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding(16)
                .background(Color.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 16))
            }

            if viewModel.phase == .failed {
                Button(action: { viewModel.resetForRescan() }) {
                    Text("Scan rejected. Tap to rescan")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Color.red)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }
}

private struct OutlineOverlay: View {
    let points: [CGPoint]

    var body: some View {
        GeometryReader { _ in
            if points.count >= 3 {
                Path { path in
                    path.addLines(points)
                    path.closeSubpath()
                }
                .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))
            }
        }
    }
}

private struct MetricChip: View {
    let label: String
    let value: Float
    let unit: String

    var body: some View {
        VStack(spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
            Text(String(format: "%.1f", value))
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
            Text(unit)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct ARViewContainer: UIViewRepresentable {
    let viewModel: ARScannerViewModel

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        viewModel.setupSession(with: arView)
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}

#Preview {
    ScannerView()
}
