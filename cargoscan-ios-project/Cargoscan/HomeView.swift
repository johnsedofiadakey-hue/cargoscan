//
//  HomeView.swift
//  Cargoscan
//
//  Created for CargoScan iOS Scanner
//

import SwiftUI

struct HomeView: View {
    @State private var showingLinkedScan = false
    @State private var showingQuickScan = false
    @State private var shipments: [Shipment] = []
    @State private var items: [CargoItem] = []
    @State private var selectedShipmentId: String = ""
    @State private var selectedCargoItemId: String = ""
    @State private var newItemDescription: String = ""
    @State private var isLoading = false
    @State private var isCreatingItem = false
    @State private var errorMessage = ""
    @State private var cbmRate: Double = 85.0
    @State private var isAnimatingIcon = false

    private var selectedShipment: Shipment? {
        shipments.first { $0.id == selectedShipmentId }
    }

    private var selectedItem: CargoItem? {
        items.first { $0.id == selectedCargoItemId }
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Premium Dark/Glassmorphic Background
                Color.black.ignoresSafeArea()
                
                // Subtle glowing orbs in background
                Circle()
                    .fill(Color.cyan.opacity(0.15))
                    .frame(width: 300, height: 300)
                    .blur(radius: 60)
                    .offset(x: -100, y: -200)
                
                Circle()
                    .fill(Color.indigo.opacity(0.15))
                    .frame(width: 300, height: 300)
                    .blur(radius: 60)
                    .offset(x: 150, y: 300)
                
                ScrollView {
                    VStack(spacing: 28) {
                        // Header
                        VStack(spacing: 12) {
                            Image(systemName: "cube.transparent.fill")
                                .font(.system(size: 64, weight: .light))
                                .foregroundStyle(
                                    LinearGradient(colors: [.cyan, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
                                )
                                .shadow(color: .cyan.opacity(0.4), radius: 10, x: 0, y: 5)
                                .scaleEffect(isAnimatingIcon ? 1.05 : 1.0)
                                .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: isAnimatingIcon)
                                .onAppear { isAnimatingIcon = true }
                            
                            Text("CargoScan LiDAR")
                                .font(.system(size: 32, weight: .black, design: .rounded))
                                .foregroundColor(.white)
                            
                            Text("Professional AR Measurement")
                                .font(.system(size: 15, weight: .medium, design: .rounded))
                                .foregroundColor(.gray)
                        }
                        .padding(.top, 40)
                        
                        if isLoading {
                            ProgressView()
                                .tint(.cyan)
                                .scaleEffect(1.2)
                                .padding(.vertical, 20)
                        }
                        
                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 24)
                        }
                        
                        // Shipment Selection Card
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Shipment Details")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundColor(.gray)
                                .textCase(.uppercase)
                            
                            VStack(spacing: 0) {
                                Picker("Shipment", selection: $selectedShipmentId) {
                                    Text("Select shipment").tag("")
                                    ForEach(shipments) { shipment in
                                        Text(shipment.code).tag(shipment.id)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .onChange(of: selectedShipmentId) { _, newValue in
                                    selectedCargoItemId = ""
                                    if !newValue.isEmpty {
                                        Task { await loadItems(shipmentId: newValue) }
                                    } else {
                                        items = []
                                    }
                                }
                                
                                if let selectedShipment {
                                    Divider().background(Color.white.opacity(0.1))
                                    HStack {
                                        Image(systemName: "arrow.left.arrow.right")
                                            .foregroundColor(.cyan)
                                        Text("\(selectedShipment.from ?? "Origin") → \(selectedShipment.to ?? "Destination")")
                                            .font(.caption.bold())
                                            .foregroundColor(.white)
                                    }
                                    .padding()
                                }
                            }
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
                        }
                        .padding(.horizontal, 24)
                        
                        // Cargo Item Selection Card
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Package Assignment")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundColor(.gray)
                                .textCase(.uppercase)
                            
                            VStack(spacing: 16) {
                                Picker("Cargo Item", selection: $selectedCargoItemId) {
                                    Text(items.isEmpty ? "No items yet" : "Select item").tag("")
                                    ForEach(items) { item in
                                        Text(item.description?.isEmpty == false ? item.description! : shortId(item.id))
                                            .tag(item.id)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(.white)
                                .disabled(selectedShipmentId.isEmpty)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                                
                                TextField("New item label, optional", text: $newItemDescription)
                                    .padding()
                                    .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1), lineWidth: 1))
                                    .foregroundColor(.white)
                                    .disabled(selectedShipmentId.isEmpty)
                                
                                Button(action: createItem) {
                                    HStack {
                                        if isCreatingItem {
                                            ProgressView().tint(.white).padding(.trailing, 4)
                                        }
                                        Label("Create Item", systemImage: "plus")
                                    }
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                                }
                                .disabled(selectedShipmentId.isEmpty || isCreatingItem)
                            }
                            .padding(16)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
                        }
                        .padding(.horizontal, 24)
                        
                        // Action Buttons
                        VStack(spacing: 16) {
                            Button(action: {
                                if !selectedCargoItemId.isEmpty {
                                    let impact = UIImpactFeedbackGenerator(style: .medium)
                                    impact.impactOccurred()
                                    showingLinkedScan = true
                                }
                            }) {
                                HStack {
                                    Image(systemName: "viewfinder")
                                    Text("Begin LiDAR Scan")
                                }
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundColor(selectedCargoItemId.isEmpty ? .gray : .black)
                                .frame(maxWidth: .infinity, minHeight: 60)
                                .background(
                                    selectedCargoItemId.isEmpty ? Color.white.opacity(0.1) : Color.cyan,
                                    in: RoundedRectangle(cornerRadius: 16)
                                )
                                .shadow(color: selectedCargoItemId.isEmpty ? .clear : .cyan.opacity(0.4), radius: 10, y: 5)
                            }
                            .disabled(selectedCargoItemId.isEmpty)
                            .navigationDestination(isPresented: $showingLinkedScan) {
                                ScannerView(cbmRate: cbmRate, cargoItemId: selectedCargoItemId)
                                    .navigationBarBackButtonHidden(true)
                                    .ignoresSafeArea()
                            }
                            
                            Button(action: {
                                let impact = UIImpactFeedbackGenerator(style: .light)
                                impact.impactOccurred()
                                showingQuickScan = true
                            }) {
                                HStack {
                                    Image(systemName: "bolt.fill")
                                    Text("Quick Test Scan")
                                }
                                .font(.system(size: 16, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 56)
                                .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                            }
                            .navigationDestination(isPresented: $showingQuickScan) {
                                ScannerView(cbmRate: cbmRate, cargoItemId: nil)
                                    .navigationBarBackButtonHidden(true)
                                    .ignoresSafeArea()
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 10)
                        
                        Spacer(minLength: 40)
                        
                        Text("CBM Rate: $\(String(format: "%.2f", cbmRate)) / m³")
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(.gray)
                            .padding(.bottom, 20)
                    }
                }
            }
            .task {
                await loadShipments()
            }
            .refreshable {
                await loadShipments()
            }
        }
        .preferredColorScheme(.dark)
    }

    private func loadShipments() async {
        await MainActor.run {
            isLoading = true
            errorMessage = ""
        }

        do {
            let loaded = try await NetworkService.shared.getShipments()
            await MainActor.run {
                shipments = loaded
                if selectedShipmentId.isEmpty, let first = loaded.first {
                    selectedShipmentId = first.id
                    Task { await loadItems(shipmentId: first.id) }
                }
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = "Could not load shipments: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }

    private func loadItems(shipmentId: String) async {
        do {
            let loaded = try await NetworkService.shared.getItems(shipmentId: shipmentId)
            await MainActor.run {
                items = loaded.filter { $0.shipmentId == shipmentId }
                selectedCargoItemId = items.first?.id ?? ""
            }
        } catch {
            await MainActor.run {
                items = []
                selectedCargoItemId = ""
                errorMessage = "Could not load items: \(error.localizedDescription)"
            }
        }
    }

    private func createItem() {
        guard !selectedShipmentId.isEmpty else { return }
        isCreatingItem = true
        errorMessage = ""

        Task {
            do {
                let item = try await NetworkService.shared.createCargoItem(
                    shipmentId: selectedShipmentId,
                    description: newItemDescription
                )
                await MainActor.run {
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.success)
                    
                    items.insert(item, at: 0)
                    selectedCargoItemId = item.id
                    newItemDescription = ""
                    isCreatingItem = false
                }
            } catch {
                await MainActor.run {
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.error)
                    
                    errorMessage = "Could not create item: \(error.localizedDescription)"
                    isCreatingItem = false
                }
            }
        }
    }

    private func shortId(_ id: String) -> String {
        String(id.prefix(8)).uppercased()
    }
}

#if DEBUG
struct HomeView_Previews: PreviewProvider {
    static var previews: some View {
        HomeView()
    }
}
#endif
