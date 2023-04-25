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
npm exec cu.upload-handler config.json PROJECT_1
```

```bash
npm exec cu.upload-handler config.json all
```

```config.json``` - is a json file with an object containing ```C_API_KEY``` and ```PROJECT_ID``` for multiple projects as in the following example:

```json
{
    "PROJECT_1": {
        "C_API_KEY": "api_key",
        "PROJECT_ID": "project_id"
    },
    "PROJECT_2": {
        "C_API_KEY": "api_key_2",
        "PROJECT_ID": "project_id_1"
    }
}
```

```PROJECT_1``` - is the name of project you want to deploy to. It can also have the value ```all```, in which case all projects will be updated.

If ```C_API_KEY``` is missing from ```config.json```, then the script will check if there is an environment variable with the following name: ```PROJECT_1_API_KEY```. If there is no api key, the upload process will not start.

By adding the flag ```--dev``` at the end of the CLI command will set the axios agent not to reject unauthorized certificates. In production it shouldn't use this flag.

example: ```npm exec cu.add-extension config.json PROJECT_1 --dev```


---

If you'd like to contribute to improve the extension, you can raise a pull reuqest here https://github.com/ali3nnn/cognigy-extension-manager

Further improvements: take the extension name from package.json
