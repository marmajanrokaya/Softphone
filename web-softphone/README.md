# Web SoftPhone - SIP/WebRTC Client

A complete, lightweight web-based SIP softphone using only plain HTML, CSS, and vanilla JavaScript.

## Project Structure

```
web-softphone/
│
├── index.html      # Main HTML page with all UI screens
├── style.css       # Complete styling (no frameworks)
├── app.js          # Application logic and UI handling
├── sip.js          # SIP.js client wrapper for WebRTC/SIP
└── assets/
    └── icons/      # (Optional icon files)
```

## Features

- **SIP over WebSocket (WSS)** - Connects to Asterisk PJSIP via WebSockets
- **WebRTC Audio** - Full duplex audio using browser WebRTC
- **Registration** - SIP registration with status indication
- **Outgoing Calls** - Dial any extension or number
- **Incoming Calls** - Full incoming call screen with accept/reject
- **Call Controls** - Mute, speaker, DTMF keypad
- **Call Timer** - Real-time call duration display
- **Call History** - Recent calls stored in localStorage
- **Settings** - Persistent settings with localStorage
- **Keyboard Support** - Full keyboard dialing (0-9, *, #, Enter, Escape, Backspace)
- **Responsive Design** - Works on desktop and mobile
- **Touch Friendly** - Large touch targets for mobile use

## Installation / Running Locally

### Option 1: Python HTTP Server (Recommended for testing)

```bash
cd web-softphone
python3 -m http.server 8080
```

Then open your browser to: `http://localhost:8080`

### Option 2: Node.js HTTP Server

```bash
cd web-softphone
npx http-server -p 8080
```

### Option 3: Any Static File Server

You can use any static file server (nginx, Apache, etc.) to serve the files.

### Important: HTTPS Requirement for Production

**WebRTC and microphone access require a secure context (HTTPS) in most browsers.**

For local testing, `localhost` is considered secure. However, for production deployment:

1. **Serve over HTTPS** - Use a valid SSL certificate
2. **WSS Required** - The WebSocket connection must be secure (wss://)
3. **Browser Restrictions** - Chrome, Firefox, Safari all require HTTPS for getUserMedia()

To run with HTTPS locally for testing:

```bash
# Using mkcert to create local certificates
mkcert -install
mkcert localhost

# Then use a server that supports HTTPS
python3 -m http.server --ssl-keyfile localhost-key.pem --ssl-certfile localhost.pem 8080
```

Or use a reverse proxy like nginx with Let's Encrypt certificates for production.

## Asterisk PJSIP Configuration Requirements

Your Asterisk server must be configured with:

### 1. PJSIP WebRTC Endpoint

In `pjsip.conf` or via ARI, configure a WebRTC-enabled endpoint:

```ini
[webrtc_endpoint]
type=endpoint
context=from-internal
disallow=all
allow=opus
allow=pcmu
allow=pcma
force_rport=yes
rewrite_contact=yes
rtp_symmetric=yes
ice_support=yes
use_avpf=yes
rtcp_mux=yes
direct_media=no
identify_by=user

[webrtc_auth]
type=auth
auth_type=userpass
password=YOUR_PASSWORD
username=1001

[webrtc_aor]
type=aor
max_contacts=5
remove_existing=yes
qualify_frequency=60

[webrtc_transport]
type=transport
protocol=wss
bind=0.0.0.0:8089
cert_file=/path/to/cert.pem
priv_key_file=/path/to/key.pem
```

### 2. HTTP/WebSocket Server

Enable the HTTP server in `http.conf`:

```ini
[general]
enabled=yes
enablestatic=yes
bindaddr=0.0.0.0
bindport=8088

[ws]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
```

### 3. WSS Configuration

For secure WebSocket (recommended):

```ini
[wss]
enabled=yes
bindaddr=0.0.0.0
bindport=8089
cert_file=/path/to/fullchain.pem
priv_key_file=/path/to/privkey.pem
```

### 4. DTLS Configuration

In `dtls.conf`:

```ini
[dtls_settings]
cert_file=/path/to/cert.pem
priv_key_file=/path/to/key.pem
ca_list_file=/path/to/ca.pem
cipher=ALL
```

### 5. RTP Configuration

In `rtp.conf`:

```ini
[general]
rtpstart=10000
rtpend=20000
strictrtp=yes
```

### 6. Codecs

Ensure these codecs are available:
- **Opus** (preferred for WebRTC)
- **PCMU** (G.711 μ-law)
- **PCMA** (G.711 A-law)

Load codec modules if needed:
```
load => res_codec_opus.so
load => codec_ulaw.so
load => codec_alaw.so
```

## Usage

### First Time Setup

1. Open the application in your browser
2. Enter your SIP credentials:
   - **SIP Username**: Your extension (e.g., 1001)
   - **SIP Password**: Your SIP password
   - **SIP Server / Domain**: Your Asterisk domain (e.g., pbx.example.com)
   - **WebSocket URL**: WSS URL (e.g., wss://pbx.example.com:8089/ws)
   - **Display Name**: Optional name shown to callers
3. Click "Connect"
4. Wait for "Registered" status

### Making Calls

1. Use the dialpad to enter a number
2. Or use keyboard (0-9, *, #)
3. Click "Call" or press Enter
4. During call:
   - Use Mute to mute/unmute microphone
   - Use Speaker for audio output selection (browser dependent)
   - Use Keypad to send DTMF tones
   - Click "End Call" or press Escape to hang up

### Receiving Calls

1. When a call arrives, you'll see the incoming call screen
2. Ringtone will play automatically
3. Click "Accept" to answer
4. Click "Reject" to decline

### Call History

1. Click "Recent" in the bottom navigation
2. View recent incoming/outgoing/missed calls
3. Click any entry to redial
4. Use "Clear History" to remove all entries

### Settings

1. Click the gear icon (⚙️) to open settings
2. Update your SIP configuration
3. Toggle "Auto Reconnect" for automatic reconnection
4. Click "Save Settings" to persist changes
5. Click "Logout" to clear credentials and disconnect

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 0-9 | Enter digit |
| * | Enter asterisk |
| # | Enter hash |
| Backspace | Delete last digit |
| Enter | Make call |
| Escape | Hangup call |

## Browser Compatibility

Tested and working on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Mobile browsers:
- iOS Safari 14+
- Chrome for Android 90+

## Debug Mode

Debug logging is enabled by default. To disable in production:

1. In `sip.js`, set `const DEBUG = false;`
2. In `app.js`, set `const DEBUG = false;`

Debug output appears in browser console (F12).

## Troubleshooting

### "Not allowed to access microphone"
- Ensure you're serving over HTTPS (or localhost)
- Grant microphone permission when prompted
- Check browser settings for microphone access

### "WebSocket connection failed"
- Verify WSS URL is correct
- Check Asterisk WebSocket configuration
- Ensure firewall allows WebSocket traffic
- Check browser console for detailed errors

### "Registration failed"
- Verify SIP credentials
- Check Asterisk PJSIP configuration
- Ensure WebSocket transport is enabled
- Check network connectivity

### "No audio" or "One-way audio"
- Check Asterisk RTP configuration
- Verify NAT/firewall settings
- Ensure codecs match between client and server
- Check browser audio permissions

### "DTMF not working"
- Verify Asterisk DTMF configuration
- Check if INFO method is enabled
- Try RFC 2833 configuration

## Security Notes

1. **Never hardcode credentials** - This application does not store passwords in source code
2. **Use WSS** - Always use secure WebSocket connections in production
3. **HTTPS Required** - Serve the application over HTTPS for WebRTC to work
4. **Password Storage** - Passwords are stored in localStorage (browser-only)
5. **Session Management** - Implement proper session timeout for production use

## License

This project is provided as-is for educational and commercial use.

## Support

For issues related to:
- **Application bugs**: Check browser console for errors
- **Asterisk configuration**: Consult Asterisk documentation
- **Network issues**: Check firewall and NAT settings
- **Browser compatibility**: Update to latest browser version
