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

    private var selectedShipment: Shipment? {
        shipments.first { $0.id == selectedShipmentId }
    }

    private var selectedItem: CargoItem? {
        items.first { $0.id == selectedCargoItemId }
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "cube.box.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.cyan)
                    Text("CargoScan LiDAR")
                        .font(.system(size: 28, weight: .black))
                    Text("Professional AR Measurement")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)

                if isLoading {
                    ProgressView("Loading shipments...")
                        .padding(.vertical, 20)
                }

                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Shipment")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.secondary)

                    Picker("Shipment", selection: $selectedShipmentId) {
                        Text("Select shipment").tag("")
                        ForEach(shipments) { shipment in
                            Text(shipment.code).tag(shipment.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(UIColor.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                    .onChange(of: selectedShipmentId) { _, newValue in
                        selectedCargoItemId = ""
                        if !newValue.isEmpty {
                            Task { await loadItems(shipmentId: newValue) }
                        } else {
                            items = []
                        }
                    }

                    if let selectedShipment {
                        Text("\(selectedShipment.from ?? "Origin") → \(selectedShipment.to ?? "Destination")")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Cargo Item")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.secondary)

                    Picker("Cargo Item", selection: $selectedCargoItemId) {
                        Text(items.isEmpty ? "No items yet" : "Select item").tag("")
                        ForEach(items) { item in
                            Text(item.description?.isEmpty == false ? item.description! : shortId(item.id))
                                .tag(item.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .disabled(selectedShipmentId.isEmpty)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(UIColor.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))

                    TextField("New item label, optional", text: $newItemDescription)
                        .textFieldStyle(.roundedBorder)
                        .disabled(selectedShipmentId.isEmpty)

                    Button(action: createItem) {
                        HStack {
                            if isCreatingItem {
                                ProgressView()
                            }
                            Label("Create Item For Scan", systemImage: "plus.square")
                        }
                        .font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(selectedShipmentId.isEmpty || isCreatingItem)

                    if let selectedItem {
                        Text("Selected: \(shortId(selectedItem.id))")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 24)
                
                // Action Buttons
                VStack(spacing: 16) {
                    // Linked Scan
                    Button(action: {
                        if !selectedCargoItemId.isEmpty {
                            showingLinkedScan = true
                        }
                    }) {
                        Label("Linked Scan", systemImage: "link")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(selectedCargoItemId.isEmpty ? Color.gray : Color.blue, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(selectedCargoItemId.isEmpty)
                    .navigationDestination(isPresented: $showingLinkedScan) {
                        ScannerView(cbmRate: cbmRate, cargoItemId: selectedCargoItemId)
                            .navigationBarBackButtonHidden(true)
                            .ignoresSafeArea()
                    }
                    
                    // Quick Scan is intentionally view-only for the pilot until the app can create cargo items.
                    Button(action: {
                        showingQuickScan = true
                    }) {
                        Label("Quick Scan", systemImage: "bolt.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Color.yellow, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .navigationDestination(isPresented: $showingQuickScan) {
                        ScannerView(cbmRate: cbmRate, cargoItemId: nil)
                            .navigationBarBackButtonHidden(true)
                            .ignoresSafeArea()
                    }
                }
                .padding(.horizontal, 24)
                
                Spacer()
                
                // Settings summary
                Text("Using CBM Rate: $\(String(format: "%.2f", cbmRate)) / m³")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 20)
                }
            }
            .background(Color(UIColor.systemGroupedBackground).ignoresSafeArea())
            .task {
                await loadShipments()
            }
            .refreshable {
                await loadShipments()
            }
        }
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
                    items.insert(item, at: 0)
                    selectedCargoItemId = item.id
                    newItemDescription = ""
                    isCreatingItem = false
                }
            } catch {
                await MainActor.run {
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
