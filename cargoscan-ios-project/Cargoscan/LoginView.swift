import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var isAnimatingIcon = false
    @Binding var isLoggedIn: Bool
    
    var body: some View {
        ZStack {
            // Premium Dark/Glassmorphic Background
            Color.black.ignoresSafeArea()
            
            // Subtle glowing orbs in background
            Circle()
                .fill(Color.cyan.opacity(0.15))
                .frame(width: 300, height: 300)
                .blur(radius: 60)
                .offset(x: -150, y: -200)
            
            Circle()
                .fill(Color.indigo.opacity(0.15))
                .frame(width: 300, height: 300)
                .blur(radius: 60)
                .offset(x: 150, y: 100)
            
            VStack(spacing: 32) {
                Spacer()
                
                // Logo
                VStack(spacing: 12) {
                    Image(systemName: "cube.transparent.fill")
                        .font(.system(size: 72, weight: .light))
                        .foregroundStyle(
                            LinearGradient(colors: [.cyan, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                        .shadow(color: .cyan.opacity(0.4), radius: 15, x: 0, y: 8)
                        .scaleEffect(isAnimatingIcon ? 1.05 : 1.0)
                        .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: isAnimatingIcon)
                        .onAppear { isAnimatingIcon = true }
                    
                    Text("CargoScan")
                        .font(.system(size: 40, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("FREIGHT INTELLIGENCE")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.cyan)
                        .tracking(3)
                }
                .padding(.bottom, 20)
                
                // Form
                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "envelope.fill")
                            .foregroundColor(.gray)
                            .frame(width: 24)
                        TextField("Email", text: $email)
                            .autocapitalization(.none)
                            .keyboardType(.emailAddress)
                            .foregroundColor(.white)
                    }
                    .padding()
                    .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    
                    HStack {
                        Image(systemName: "lock.fill")
                            .foregroundColor(.gray)
                            .frame(width: 24)
                        SecureField("Password", text: $password)
                            .foregroundColor(.white)
                    }
                    .padding()
                    .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                }
                .padding(.horizontal, 24)
                
                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal, 24)
                        .multilineTextAlignment(.center)
                }
                
                // Login Button
                Button(action: attemptLogin) {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .tint(.white)
                                .padding(.trailing, 8)
                        }
                        Text(isLoading ? "Authenticating..." : "Sign In")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                    }
                    .frame(maxWidth: .infinity, minHeight: 60)
                    .background(
                        LinearGradient(colors: [.cyan, .indigo], startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 16)
                    )
                    .foregroundColor(.white)
                    .shadow(color: .indigo.opacity(0.4), radius: 15, y: 8)
                }
                .disabled(isLoading || email.isEmpty || password.isEmpty)
                .padding(.horizontal, 24)
                .padding(.top, 8)
                
                Spacer()
                
                Text("© 2026 CargoScan")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding(.bottom)
            }
        }
        .preferredColorScheme(.dark)
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
                        let impact = UINotificationFeedbackGenerator()
                        impact.notificationOccurred(.success)
                        isLoggedIn = true
                    } else {
                        let impact = UINotificationFeedbackGenerator()
                        impact.notificationOccurred(.error)
                        errorMessage = "Login failed. Please check your credentials."
                    }
                }
            } catch {
                await MainActor.run {
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.error)
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
