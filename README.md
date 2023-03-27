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

```config.json``` - is a json file with an object containing ```C_API_KEY``` and ```PROJECT_ID``` for multiple projects as in the following example:

```json
{
    "project1": {
        "C_API_KEY": "api_key",
        "PROJECT_ID": "project_id"
    },
    "project2": {
        "C_API_KEY": "api_key_2",
        "PROJECT_ID": "project_id_1"
    }
}
```

```extension-name``` - is the name of extension. The same name as in ```package.json```

```project-name``` - is the name of project you want to deploy to (eg.: ```project1```, ```project2```). It can also have the value ```all```, in which case all projects will be updated.


---

If you'd like to contribute to improve the extension, you can raise a pull reuqest here https://github.com/ali3nnn/cognigy-extension-manager

Further improvements: 
1. adding the posibility to upload the same extension to multiple projects automatically.
2. getting the extension name from ```package.json```
