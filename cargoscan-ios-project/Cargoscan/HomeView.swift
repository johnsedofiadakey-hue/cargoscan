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
    @State private var inputCargoItemId: String = ""
    @State private var cbmRate: Double = 85.0
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 30) {
                
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
                
                Spacer()
                
                // Track ID Input for Linked Scan
                VStack(alignment: .leading, spacing: 10) {
                    Text("Cargo Item ID (Optional for Quick Scan)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.secondary)
                        .padding(.leading, 4)
                    
                    TextField("Enter Tracking ID (e.g. ITEM-1234)", text: $inputCargoItemId)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .font(.system(size: 18, weight: .semibold, design: .monospaced))
                        .autocapitalization(.allCharacters)
                        .disableAutocorrection(true)
                }
                .padding(.horizontal, 24)
                
                // Action Buttons
                VStack(spacing: 16) {
                    // Linked Scan
                    Button(action: {
                        if !inputCargoItemId.isEmpty {
                            showingLinkedScan = true
                        }
                    }) {
                        Label("Linked Scan", systemImage: "link")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(inputCargoItemId.isEmpty ? Color.gray : Color.blue, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(inputCargoItemId.isEmpty)
                    .navigationDestination(isPresented: $showingLinkedScan) {
                        ScannerView(cbmRate: cbmRate, cargoItemId: inputCargoItemId)
                            .navigationBarBackButtonHidden(true)
                            .ignoresSafeArea()
                    }
                    
                    // Quick Scan
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
            .background(Color(UIColor.systemGroupedBackground).ignoresSafeArea())
        }
    }
}

#Preview {
    HomeView()
}
