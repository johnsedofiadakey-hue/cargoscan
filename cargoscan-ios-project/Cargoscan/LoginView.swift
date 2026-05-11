import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @Binding var isLoggedIn: Bool
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            // Logo
            VStack(spacing: 8) {
                Image(systemName: "cube.box.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)
                
                Text("CargoScan")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Freight Intelligence")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .tracking(2)
            }
            .padding(.bottom, 32)
            
            // Form
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                    .keyboardType(.emailAddress)
                
                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            .padding(.horizontal)
            
            if !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal)
            }
            
            // Login Button
            Button(action: attemptLogin) {
                HStack {
                    if isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .padding(.trailing, 8)
                    }
                    Text(isLoading ? "Signing in..." : "Sign In")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                .padding(.horizontal)
            }
            .disabled(isLoading || email.isEmpty || password.isEmpty)
            
            Spacer()
            
            Text("© 2026 CargoScan")
                .font(.caption)
                .foregroundColor(.gray)
                .padding(.bottom)
        }
        .background(Color(.systemBackground))
    }
    
    private func attemptLogin() {
        guard !email.isEmpty, !password.isEmpty else { return }
        
        isLoading = true
        errorMessage = ""
        
        Task {
            do {
                let success = try await NetworkService.shared.login(email: email, password: password)
                await MainActor.run {
                    isLoading = false
                    if success {
                        isLoggedIn = true
                    } else {
                        errorMessage = "Login failed. Please check your credentials."
                    }
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        LoginView(isLoggedIn: .constant(false))
    }
}
