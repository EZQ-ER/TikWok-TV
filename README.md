# TikWok TV

Unofficial third-party short-video viewer for LG webOS TVs, made for the remote control.

**Original from EZQ**

> TikWok TV is not affiliated with, endorsed by, or sponsored by TikTok or ByteDance. All trademarks belong to their owners.

## Features

- Lightweight one-video-at-a-time player built for TV performance
- TV-style menu on the left (search, For You, explore, mini dramas, live, profile, more)
- Action buttons for follow, like and comments
- Remote-control friendly navigation
- Configurable server address, saved on the TV
- Optional tiktok.com wrapper script with TV-friendly styling

## Requirements

- LG webOS TV with Developer Mode, or a rooted TV with [Homebrew Channel](https://www.webosbrew.org)
- Internet connection

## Install

### Homebrew Channel
Search for **TikWok TV** in Homebrew Channel and press Install (once listed).

### Manual
1. Download `TikWok_TV_802.ipk` from the [Releases](../../releases) page.
2. Install it with the webOS CLI:
   ```
   ares-install --device <your-tv> TikWok_TV_802.ipk
   ares-launch --device <your-tv> com.tikwok.tv.ezq
   ```

## Settings

Open **More** in the app to set the server address (for example `192.168.1.20:8080` or `https://my-server.example.com`), region, video quality and other options.

## Package info

- App ID: `com.tikwok.tv.ezq`
- Version: 8.0.2
- Resolution: 1920x1080

## License

[MIT](LICENSE) © 2026 EZQ
