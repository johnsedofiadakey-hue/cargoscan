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
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.94, green: 0.97, blue: 0.99),
                        Color(red: 0.86, green: 0.91, blue: 0.97)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        header

                        if isLoading {
                            ProgressView()
                                .tint(Color(red: 0.06, green: 0.46, blue: 0.42))
                                .padding(.vertical, 10)
                        }

                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color(red: 0.72, green: 0.11, blue: 0.11))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(Color(red: 1.0, green: 0.95, blue: 0.95), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.red.opacity(0.18), lineWidth: 1))
                        }

                        VStack(alignment: .leading, spacing: 14) {
                            cardTitle("Shipment", systemImage: "shippingbox")

                            Picker("Shipment", selection: $selectedShipmentId) {
                                Text("Select shipment").tag("")
                                ForEach(shipments) { shipment in
                                    Text(shipment.code).tag(shipment.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(Color(red: 0.06, green: 0.46, blue: 0.42))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color(red: 0.97, green: 0.98, blue: 1.0), in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))
                            .onChange(of: selectedShipmentId) { _, newValue in
                                selectedCargoItemId = ""
                                if !newValue.isEmpty {
                                    Task { await loadItems(shipmentId: newValue) }
                                } else {
                                    items = []
                                }
                            }

                            if let selectedShipment {
                                HStack(spacing: 10) {
                                    Image(systemName: "arrow.left.arrow.right")
                                        .foregroundColor(Color(red: 0.06, green: 0.46, blue: 0.42))
                                    Text("\(selectedShipment.from ?? "Origin") to \(selectedShipment.to ?? "Destination")")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(Color(red: 0.26, green: 0.32, blue: 0.39))
                                    Spacer()
                                }
                                .padding(12)
                                .background(Color(red: 0.91, green: 0.97, blue: 0.96), in: RoundedRectangle(cornerRadius: 10))
                            }
                        }
                        .cardSurface()

                        VStack(alignment: .leading, spacing: 14) {
                            cardTitle("Package", systemImage: "cube.box")

                            Picker("Cargo Item", selection: $selectedCargoItemId) {
                                Text(items.isEmpty ? "No packages yet" : "Select package").tag("")
                                ForEach(items) { item in
                                    Text(item.description?.isEmpty == false ? item.description! : shortId(item.id))
                                        .tag(item.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(Color(red: 0.06, green: 0.46, blue: 0.42))
                            .disabled(selectedShipmentId.isEmpty)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color(red: 0.97, green: 0.98, blue: 1.0), in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))

                            TextField("Create package label, optional", text: $newItemDescription)
                                .font(.system(size: 15, weight: .semibold))
                                .padding(14)
                                .background(Color(red: 0.97, green: 0.98, blue: 1.0), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))
                                .disabled(selectedShipmentId.isEmpty)

                            Button(action: createItem) {
                                HStack(spacing: 9) {
                                    if isCreatingItem {
                                        ProgressView().tint(.white)
                                    }
                                    Label("Create package", systemImage: "plus")
                                }
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(Color(red: 0.07, green: 0.10, blue: 0.15), in: RoundedRectangle(cornerRadius: 10))
                            }
                            .disabled(selectedShipmentId.isEmpty || isCreatingItem)
                            .opacity(selectedShipmentId.isEmpty || isCreatingItem ? 0.52 : 1)
                        }
                        .cardSurface()

                        VStack(spacing: 10) {
                            Button(action: {
                                if !selectedCargoItemId.isEmpty {
                                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                                    showingLinkedScan = true
                                }
                            }) {
                                HStack {
                                    Image(systemName: "viewfinder")
                                    Text("Begin LiDAR scan")
                                }
                                .font(.system(size: 17, weight: .black))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 58)
                                .background(Color(red: 0.06, green: 0.46, blue: 0.42), in: RoundedRectangle(cornerRadius: 10))
                                .shadow(color: Color(red: 0.06, green: 0.46, blue: 0.42).opacity(selectedCargoItemId.isEmpty ? 0 : 0.22), radius: 18, y: 10)
                            }
                            .disabled(selectedCargoItemId.isEmpty)
                            .opacity(selectedCargoItemId.isEmpty ? 0.48 : 1)
                            .navigationDestination(isPresented: $showingLinkedScan) {
                                ScannerView(cbmRate: cbmRate, cargoItemId: selectedCargoItemId)
                                    .navigationBarBackButtonHidden(true)
                                    .ignoresSafeArea()
                            }

                            Button(action: {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                showingQuickScan = true
                            }) {
                                HStack {
                                    Image(systemName: "bolt.fill")
                                    Text("Quick test scan")
                                }
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Color(red: 0.07, green: 0.10, blue: 0.15))
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))
                            }
                            .navigationDestination(isPresented: $showingQuickScan) {
                                ScannerView(cbmRate: cbmRate, cargoItemId: nil)
                                    .navigationBarBackButtonHidden(true)
                                    .ignoresSafeArea()
                            }
                        }
                        .padding(.top, 2)

                        Text("CBM Rate: $\(String(format: "%.2f", cbmRate)) / m3")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(red: 0.45, green: 0.51, blue: 0.58))
                            .padding(.vertical, 14)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .task {
                await loadShipments()
            }
            .refreshable {
                await loadShipments()
            }
        }
        .preferredColorScheme(.light)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(red: 0.06, green: 0.46, blue: 0.42), Color(red: 0.15, green: 0.39, blue: 0.92)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    Text("CS")
                        .font(.system(size: 17, weight: .black))
                        .foregroundColor(.white)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text("CargoScan")
                        .font(.system(size: 17, weight: .black))
                        .foregroundColor(.white)
                    Text("Operator console")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white.opacity(0.66))
                }

                Spacer()

                Text("\(items.count) pkg")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(.white.opacity(0.14), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Scan queue")
                    .font(.system(size: 36, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .tracking(-1)
                Text("Choose a shipment package, capture dimensions, and send scan quality back to the warehouse dashboard.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.74))
                    .lineSpacing(2)
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 52)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(red: 0.03, green: 0.09, blue: 0.16), Color(red: 0.06, green: 0.46, blue: 0.42), Color(red: 0.15, green: 0.39, blue: 0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 14)
        )
        .padding(.top, 10)
    }

    private func cardTitle(_ text: String, systemImage: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: systemImage)
                .foregroundColor(Color(red: 0.06, green: 0.46, blue: 0.42))
            Text(text)
                .font(.system(size: 13, weight: .black))
                .foregroundColor(Color(red: 0.26, green: 0.32, blue: 0.39))
                .textCase(.uppercase)
            Spacer()
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

private extension View {
    func cardSurface() -> some View {
        self
            .padding(16)
            .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.black.opacity(0.07), lineWidth: 1))
            .shadow(color: .black.opacity(0.08), radius: 18, y: 10)
    }
}

#if DEBUG
struct HomeView_Previews: PreviewProvider {
    static var previews: some View {
        HomeView()
    }
}
#endif
