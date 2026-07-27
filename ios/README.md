# 장소모아 iOS 앱

현재 Next.js 웹 서비스를 iPhone 앱으로 설치할 수 있게 감싸는 SwiftUI + WKWebView Xcode 프로젝트입니다.

## 웹 주소 변경

기본 주소는 `https://place-moa-kr.vercel.app`입니다.

주소를 바꾸려면 `PlaceMoa/Config.xcconfig`를 수정하세요.

```xcconfig
PLACE_MOA_WEB_SCHEME = https
PLACE_MOA_WEB_HOST = place-moa-kr.vercel.app
PLACE_MOA_WEB_PORT =
PLACE_MOA_WEB_PATH =
```

로컬 개발 서버를 시뮬레이터에서 열려면:

```xcconfig
PLACE_MOA_WEB_SCHEME = http
PLACE_MOA_WEB_HOST = localhost
PLACE_MOA_WEB_PORT = 3000
PLACE_MOA_WEB_PATH =
```

## Xcode에서 아이폰에 설치

1. `ios/PlaceMoa.xcodeproj`를 Xcode로 엽니다.
2. 왼쪽 프로젝트 네비게이터에서 `PlaceMoa` 프로젝트 > `PlaceMoa` 타깃 > `Signing & Capabilities`로 갑니다.
3. `Team`에 본인의 Apple Developer 계정을 선택합니다.
4. 실제 iPhone을 Mac에 연결하고 상단 실행 대상에서 해당 iPhone을 선택합니다.
5. Run 버튼을 누르면 iPhone에 `장소모아` 앱이 설치됩니다.

무료 Apple 계정으로 설치하면 앱 서명이 일정 기간 후 만료될 수 있습니다. 계속 사용하려면 다시 Xcode에서 Run 하면 됩니다.

## 공유 시트 테스트

1. Xcode에서 `PlaceMoa` 스킴으로 iPhone에 앱을 설치합니다.
2. Safari, Instagram, YouTube 등에서 링크 공유 버튼을 누릅니다.
3. 공유 시트에서 `장소모아`를 선택합니다. 처음 안 보이면 앱 목록의 `더 보기`에서 활성화합니다.
4. 앱이 열리면서 공유한 링크를 AI로 분석하고, 결과를 `대기함`에 쌓습니다.
5. 대기함에서 카테고리와 체크 상태를 확인한 뒤 `선택한 N곳 추가`를 누릅니다.

공유로 들어온 링크는 장소가 1개만 추출되어도 바로 저장하지 않고 대기함으로 보냅니다.

## 네이버지도 앱 연결

iPhone에서 `리뷰` 또는 `네이버지도`를 누르면 `nmap://search?...`로 네이버지도 앱을 엽니다. 네이버지도 앱이 없으면 모바일 네이버지도 웹 검색으로 폴백합니다.

## CLI 빌드 확인

```bash
xcodebuild -project ios/PlaceMoa.xcodeproj \
  -scheme PlaceMoa \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```
