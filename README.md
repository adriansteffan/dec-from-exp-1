# Experiment Boilerplate

Built with [reactive](https://github.com/adriansteffan/reactive)

## Prerequisites and Setup

Regardless of what platform you target with your experiment, you will need a current version of [node.js](https://nodejs.org/en/download/) installed on your system for development.

To install the needed dependencies, run the following in the root directory:

```
npm i && npm i --prefix backend
```

You can target multiple platforms at once, just follow the setup processes for all platforms you want to run you study on.

## Target: Web (Online Experiment)

This is the version of the experiment you should use if your testing devices have internet access and don't need any device-specific functionalities (e.g. sensors). The web version will work on all platforms! The specific targets serve as replacements in situations where a stable internet connection might not be given, or privacy directives prevent you from uploading data to a server (and/or you need device-specific functionality).

### Development

The web version of the experiment needs no additional setup for development.

Run the app in development mode with

```
npm run dev:all
```
in the root directory.

By default, open [http://localhost:5173](http://localhost:5173) to view it in the browser.
The page will reload if you make edits.


#### Buidling the frontend locally (to test)


From the `frontend` directory, run

```
npm run build
```

the resulting output can be found in `frontend/dist/`


### Deployment


For deployment, you will need a server with an installation of [docker](https://docs.docker.com/engine/install/)


To build the docker images, run 

```
docker compose build
```

in the root directory. This might take a while.

#### Running the app

After completing the setup, start the webapp with

```
docker compose up -d
```

and stop it with

```
docker compose down
```

The server will be attached to the ports you specified in the .env files.
Use Virtualhosts (Apache) or Server Blocks (Nginx) with reverse proxy to expose these to the outside. [This guide](https://gist.github.com/adriansteffan/48c9bda7237a8a7fcc5bb6987c8e1790) explains how to do this for our setup.

#### Updating

To update the app, simply stop the running containers, run a `git pull` and build the docker containers once more, and start the containers again.

#### Where is my data stored?

The server will create a "data" directory in the root directory of the cloned repo,


## Simulation

You can simulate your experiment headlessly to generate synthetic data, test your data pipeline, or plan sample sizes.

### Setup

Define your participant generator and simulation config in `Experiment.tsx`:

```tsx
export const simulationConfig = {
  participants: {
    generator: (i) => ({ id: i, nickname: `participant_${i}` }),
    count: 10,
  },
};
```

### Running

```
npm run simulate
```

This starts the backend, simulates all participants through the experiment, and shuts down. The simulated data ends up in `backend/data/`.

### Customizing participant behavior

Each trial component has default decision functions that model participant behavior. Override them per-trial using the `simulators` property on a timeline item:

```tsx
{
  type: 'PlainInput',
  props: { content: <p>What is your name?</p> },
  simulators: {
    respond: (_trialProps, participant) => ({
      value: participant.nickname,
      participantState: participant,
    }),
  },
}
```

### Custom components

Register simulations for your custom trial components using `registerSimulation`. See the `CustomTrial` example in `Experiment.tsx` and the [reactive README](https://github.com/adriansteffan/reactive) for details.

### Hybrid mode

During development, auto-advance simulated trials while manually interacting with others:

Add `?hybridSimulation=true` to the URL:

```
http://localhost:5173?hybridSimulation=true
```

Trials with `simulators` or `simulate: true` defined will auto-advance. Others render normally for human interaction. Hybrid mode is enabled by default during development. For production, set `VITE_DISABLE_HYBRID_SIMULATION=true` to disable it.


## Transcription

Automatically transcribe voice recordings from experiment data using Docker. Requires [Docker](https://docs.docker.com/engine/install/) to be installed.

### CPU (faster-whisper)

```
npm run transcribe
```

### GPU (qwen-asr, requires NVIDIA GPU)

```
npm run transcribe:gpu
```

### Options

```
npm run transcribe -- --overwrite       # re-transcribe even if transcriptions.csv exists
npm run transcribe -- --model small     # use a different model
```

Output: `transcriptions.csv` in each participant's data directory with `filename,text` columns. The model is cached in a Docker volume, so it only downloads once.


## Target: Windows or MacOS

### Development

The desktop version of the experiment needs no additional setup for development.

Run the app in the development mode with

```
npm run electron:dev
```
in the root directory.

### Packaging

To build platform specific executables, run either

```
npm run package:mac
```

or 

```
npm run package:win
```

There will be a directory called "release" that will contain your executables.

#### Where is my data stored?

* Windows:
    * On windows, a folder called "data" is created next the executable as soon as the first participant has completed the study

* MacOS:
    * Right click on the application and go to TODO > TODO > TODO, where a folder called "data" is created as soon as the first participant has completed the study



## Target: Android

For ease of use, it makes sense to run the web version for most of the development and only switch to the specific device emulators for implementing device-specific features and testing compatibility before packaging.

### Setup

To build and test an Adroid app containing your experiment, you will need an installation of 
[Android Studio](https://developer.android.com/studio) and [Java 21 or later](https://www.oracle.com/de/java/technologies/downloads/)

To set up the android project, run this command in the root directory:
```
npx cap add android
````

Next, find the [path to your local android sdk](https://stackoverflow.com/questions/25176594/android-sdk-location) and create a `local.properties` file in the `android` folder with the following content:

```
sdk.dir=SDK_PATH_HERE
```

If you want to enable file saving for Android versions <= 10, add these lines to the `android/app/main/AndroidManifest.xml`:

```
<manifest xmlns:android="http://schemas.android.com/apk/res/android"> // this line is already there

    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- For Android 10+ (API 29+) -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

    <application
        android:requestLegacyExternalStorage="true" // add this to the application tag
```

For more information, refer to the [Capacitor documentation on Android](https://capacitorjs.com/docs/android)


### Running

Whenever you have made changes to the code and want to run it on the Android emulator, run:
```
npm run build
npx cap sync
npx cap run android
```

### Packaging

From the root directory, run

```
npx cap open android
```

. Wait for Android Studio to install the project dependencies and then run Build > Generate APKs and Bundles > Generate APKs. Once your build is finished, there will be a popup guiding you to the location of the bundle's app that you can transfer to your Android device.

#### Where is my data stored?

In the "Internal Storage" section of the file browser, you will find a "Documents" folder that will contain subfolders with your data as soon as the first participant has finished the experiment.

## Target: iOS

For ease of use, it makes sense to run the web version for most of the development and only switch to the specific device emulators for implementing device-specific features and testing compatibility before packaging.

### Setup

To build an iOS app containing your experiment, you will need a machine running MacOS and an installation of [XCode](https://apps.apple.com/us/app/xcode/id497799835). Furthermore, you will need to install [CocoaPods](https://cocoapods.org/), which is most easily installed with [Homebrew](https://brew.sh/).

To set up the iOS project, run 

```
npx cap add ios
```

Then, go to `iso > App > App > Info.plist`

And add these lines next to the other keys:

```
<key>UIFileSharingEnabled</key>
<string>YES</string>
<key>LSSupportsOpeningDocumentsInPlace</key>
<string>YES</string>
```

For more information, refer to the [Capacitor documentation on iOS](https://capacitorjs.com/docs/ios)

### Running

Whenever you have made changes to the code and want to run it on the iOS emulator, run:

```
npm run build
npx cap sync
npx cap run ios
```

### Packaging

Packaging iOS apps is quite an undertaking, which is why the process is not overly streamlined/documented yet. The best way to get your experiment on an iOS device right now is to run

```
npx cap run ios
```

which will open the finished project in XCode. From there, follow a guide on how to sign, bundle and install your app/experiment.

#### Where is my data stored?

After the first participant is run, a folder with the name of your app will appear under "My iPhone/iPad" in the files app, which contains your data.



## Authors

* **Adrian Steffan** - [adriansteffan](https://github.com/adriansteffan)



