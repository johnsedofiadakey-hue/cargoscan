import SwiftUI
import ARKit
import RealityKit

struct ScannerView: View {
    @StateObject var viewModel = ARScannerViewModel()
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            ARViewContainer(viewModel: viewModel)
                .edgesIgnoringSafeArea(.all)
            
            // AI HUD - TOP
            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Circle()
                                .fill(viewModel.isStable ? Color.green : Color.blue)
                                .frame(width: 8, height: 8)
                                .opacity(0.8)
                            Text(viewModel.aiMessage)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                            
                            if viewModel.isCalibrated {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundColor(.green)
                                    .font(.system(size: 12))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.8))
                        .cornerRadius(20)
                        
                        if viewModel.phase == .scanning {
                            ProgressView(value: viewModel.progress, total: 1.0)
                                .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                                .frame(width: 200)
                                .padding(.top, 4)
                        }
                    }
                    Spacer()
                    
                    // Stats overlay
                    VStack(alignment: .trailing) {
                        Text("Distance")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                        Text(String(format: "%.1f m", viewModel.distance))
                            .font(.system(size: 20, weight: .bold, design: .monospaced))
                            .foregroundColor(viewModel.isStable ? .green : .white)
                    }
                }
                .padding(.top, 50)
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Guidance and Controls
                VStack(spacing: 20) {
                    if viewModel.phase == .ready {
                        Button(action: { viewModel.startScan() }) {
                            Text("Start Scanning 🎥")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 240, height: 60)
                                .background(Color.blue)
                                .cornerRadius(30)
                                .shadow(radius: 10)
                        }
                    } else if viewModel.phase == .completed {
                        VStack(spacing: 12) {
                            HStack(spacing: 30) {
                                StatValue(label: "L", value: "60.0", unit: "cm")
                                StatValue(label: "W", value: "45.0", unit: "cm")
                                StatValue(label: "H", value: "40.0", unit: "cm")
                            }
                            
                            Divider().background(Color.white.opacity(0.2))
                            
                            HStack {
                                Text("CBM: 0.1080")
                                Spacer()
                                Text("Cost: $9.18")
                            }
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.green)
                            
                            Button(action: { viewModel.phase = .ready }) {
                                Text("Save & Next Scan →")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(.black)
                                    .frame(maxWidth: .infinity, height: 50)
                                    .background(Color.green)
                                    .cornerRadius(12)
                            }
                        }
                        .padding(20)
                        .background(BlurView(style: .dark))
                        .cornerRadius(20)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 40)
                    }
                }
            }
        }
    }
}

struct StatValue: View {
    let label: String
    let value: String
    let unit: String
    
    var body: some View {
        VStack {
            Text(label).font(.system(size: 10)).foregroundColor(.white.opacity(0.5))
            Text(value).font(.system(size: 24, weight: .black, design: .monospaced))
            Text(unit).font(.system(size: 10)).foregroundColor(.white.opacity(0.7))
        }
        .foregroundColor(.white)
    }
}

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
    func makeUIView(context: Context) -> UIVisualEffectView { UIVisualEffectView(effect: UIBlurEffect(style: style)) }
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

#Preview {
    ScannerView()
}
