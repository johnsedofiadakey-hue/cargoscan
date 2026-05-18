import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @Binding var isLoggedIn: Bool

    var body: some View {
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

            VStack(spacing: 0) {
                hero

                VStack(spacing: 16) {
                    inputRow(systemImage: "envelope", placeholder: "Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)

                    secureRow

                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Color(red: 0.72, green: 0.11, blue: 0.11))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 2)
                    }

                    Button(action: attemptLogin) {
                        HStack(spacing: 10) {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(isLoading ? "Authenticating" : "Sign in")
                        }
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background(Color(red: 0.06, green: 0.46, blue: 0.42), in: RoundedRectangle(cornerRadius: 10))
                        .shadow(color: Color(red: 0.06, green: 0.46, blue: 0.42).opacity(0.24), radius: 18, y: 10)
                    }
                    .disabled(isLoading || email.isEmpty || password.isEmpty)
                    .opacity(isLoading || email.isEmpty || password.isEmpty ? 0.55 : 1)

                    Text("Use the same workspace credentials assigned in the CargoScan dashboard.")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(red: 0.39, green: 0.45, blue: 0.52))
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
                .padding(20)
                .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.black.opacity(0.07), lineWidth: 1))
                .shadow(color: .black.opacity(0.10), radius: 28, y: 16)
                .padding(.horizontal, 20)
                .offset(y: -34)

                Spacer(minLength: 0)

                Text("CargoScan Mobile")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(red: 0.45, green: 0.51, blue: 0.58))
                    .padding(.bottom, 18)
            }
        }
        .preferredColorScheme(.light)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(red: 0.06, green: 0.46, blue: 0.42), Color(red: 0.15, green: 0.39, blue: 0.92)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    Text("CS")
                        .font(.system(size: 17, weight: .black))
                        .foregroundColor(.white)
                }
                .frame(width: 46, height: 46)

                VStack(alignment: .leading, spacing: 2) {
                    Text("CargoScan")
                        .font(.system(size: 17, weight: .black))
                        .foregroundColor(.white)
                    Text("Warehouse scanner")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white.opacity(0.64))
                }

                Spacer()
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Freight measurement that feels operational.")
                    .font(.system(size: 36, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .tracking(-1)
                    .lineLimit(3)

                Text("Log in, select a shipment package, and capture LiDAR dimensions with scan quality checks.")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.76))
                    .lineSpacing(3)
            }

            HStack(spacing: 10) {
                heroPill("LiDAR")
                heroPill("Photos")
                heroPill("CBM")
                heroPill("QC")
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 56)
        .padding(.bottom, 68)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(red: 0.03, green: 0.09, blue: 0.16), Color(red: 0.06, green: 0.46, blue: 0.42), Color(red: 0.15, green: 0.39, blue: 0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private func heroPill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .black))
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.white.opacity(0.13), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.13), lineWidth: 1))
    }

    private func inputRow(systemImage: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(Color(red: 0.06, green: 0.46, blue: 0.42))
                .frame(width: 22)
            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color(red: 0.07, green: 0.10, blue: 0.15))
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 50)
        .background(Color(red: 0.97, green: 0.98, blue: 1.0), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))
    }

    private var secureRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(Color(red: 0.06, green: 0.46, blue: 0.42))
                .frame(width: 22)
            SecureField("Password", text: $password)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color(red: 0.07, green: 0.10, blue: 0.15))
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 50)
        .background(Color(red: 0.97, green: 0.98, blue: 1.0), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.07), lineWidth: 1))
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
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        isLoggedIn = true
                    } else {
                        UINotificationFeedbackGenerator().notificationOccurred(.error)
                        errorMessage = "Login failed. Please check your credentials."
                    }
                }
            } catch {
                await MainActor.run {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
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
