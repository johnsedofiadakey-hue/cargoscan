# CargoScan iPhone Install

The iOS app is already configured to use the production API:

```text
https://cargoscan-api.onrender.com/api
```

## Install on a physical iPhone

1. Connect the LiDAR iPhone to this Mac with a USB cable.
2. Unlock the iPhone and tap **Trust This Computer** if prompted.
3. Open `cargoscan-ios-project/Cargoscan.xcodeproj` in Xcode.
4. In the Xcode device selector, choose the connected physical iPhone.
5. Select the `Cargoscan` target, open **Signing & Capabilities**, and enable **Automatically manage signing**.
6. Choose the correct Apple Developer team.
7. Press **Run** in Xcode.
8. If iOS blocks first launch, open **Settings > General > VPN & Device Management** on the iPhone and trust the developer profile.

Code cannot register the phone automatically. Apple Developer and Xcode must see the physical device before the app can be signed and installed.
