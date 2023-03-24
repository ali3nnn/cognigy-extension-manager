# cognigy-extension-manager

The script is used to upload the extensions to Cognigy by running a simple command from within the pipeline or manually.

To use this script in a repo follow the steps:

1. Install the package inside the extension repo:
```bash
npm i cognigy-extension-manager@latest --save-dev
```

2. Add execution permission for the script
```bash
chmod +x node_modules/.bin/cu.upload-handler
```

3. Run the script
```bash
npm exec cu.upload-handler config.json extension-name
```

```config.json``` - is a json file having the following keys ```C_API_KEY``` and ```PROJECT_ID```.

```extension-name``` - is the name of application. The same name as in ```package.json```

If you'd like to contribute to improve the extension, you can raise a pull reuqest here https://github.com/ali3nnn/cognigy-extension-manager