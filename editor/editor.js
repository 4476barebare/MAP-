/* =====================================================
   ファイル
===================================================== */

let currentFileName = "untitled.js";


/* =====================================================
   編集状態
===================================================== */

let editMode = false;


/* =====================================================
   折り畳み情報
===================================================== */

let foldData = [];


/* =====================================================
   CodeMirror
===================================================== */

const editor = CodeMirror(

    document.getElementById(
        "editor-container"
    ),

    {

        value:
            "// ここにコードを入力してください",

        mode: "javascript",

        lineNumbers: true,

        lineWrapping: false,

        /*
         * CodeMirrorの通常入力欄。
         *
         * 編集開始はJSから明示的に行う。
         */

        inputStyle: "textarea",

        spellcheck: false

    }

);


/* =====================================================
   起動時
===================================================== */

editor.setOption(
    "readOnly",
    true
);


/* =====================================================
   インデント
===================================================== */

function getIndent(text) {

    const match =
        text.match(/^[ \t]*/);


    if (!match) {

        return 0;
    }


    let result = 0;


    for (
        let i = 0;
        i < match[0].length;
        i++
    ) {

        if (
            match[0][i] === "\t"
        ) {

            result += 4;

        } else {

            result++;
        }

    }


    return result;

}


/* =====================================================
   ブロック開始
===================================================== */

function isBlockStart(text) {

    const line =
        text.trim();


    if (!line) {

        return false;
    }


    /*
     * async function
     */

    if (
        /^(async\s+)?function\b/.test(line)
    ) {

        return true;
    }


    /*
     * class
     */

    if (
        /^class\b/.test(line)
    ) {

        return true;
    }


    /*
     * if / else / for / while / switch
     */

    if (
        /^(if|else|for|while|switch|try|catch|finally)\b/.test(line)
    ) {

        return true;
    }


    /*
     * その他の { ブロック
     */

    if (
        line.endsWith("{")
    ) {

        return true;
    }


    /*
     * HTML
     */

    if (
        /^<[A-Za-z][^>]*>$/.test(line)
    ) {

        return true;
    }


    return false;

}


/* =====================================================
   ブロック終了
===================================================== */

function findBlockEnd(startLine) {

    const total =
        editor.lineCount();


    const startText =
        editor.getLine(startLine);


    /*
     * { } を優先
     */

    let braceCount = 0;

    let hasBrace = false;


    for (
        let i = startLine;
        i < total;
        i++
    ) {

        const text =
            editor.getLine(i);


        for (
            let j = 0;
            j < text.length;
            j++
        ) {

            if (
                text[j] === "{"
            ) {

                braceCount++;

                hasBrace = true;

            }

            else if (
                text[j] === "}"
            ) {

                braceCount--;

            }

        }


        if (
            hasBrace &&
            braceCount === 0 &&
            i > startLine
        ) {

            return i;

        }

    }


    /*
     * インデントベース
     */

    const startIndent =
        getIndent(startText);


    for (
        let i = startLine + 1;
        i < total;
        i++
    ) {

        const text =
            editor.getLine(i);


        if (!text.trim()) {

            continue;
        }


        if (
            getIndent(text) <= startIndent
        ) {

            return i - 1;
        }

    }


    return null;

}


/* =====================================================
   折り畳み情報を作る
===================================================== */

function buildFoldData() {

    foldData = [];


    for (
        let i = 0;
        i < editor.lineCount();
        i++
    ) {

        const text =
            editor.getLine(i);


        if (
            !isBlockStart(text)
        ) {

            continue;
        }


        const end =
            findBlockEnd(i);


        if (
            end === null ||
            end <= i
        ) {

            continue;
        }


        foldData.push({

            from: i,

            to: end,

            folded: false,

            marker: null

        });

    }

}


/* =====================================================
   折り畳みマーカーを作る
===================================================== */

function createFoldMarker(data) {

    const marker =
        editor.markText(

            CodeMirror.Pos(
                data.from,
                0
            ),

            CodeMirror.Pos(
                data.to + 1,
                0
            ),

            {

                collapsed: true,

                inclusiveLeft: false,

                inclusiveRight: false

            }

        );


    data.marker =
        marker;


    data.folded =
        true;

}


/* =====================================================
   指定ブロックを展開
===================================================== */

function unfoldBlock(data) {

    if (
        !data.marker
    ) {

        return;
    }


    data.marker.clear();


    data.marker =
        null;


    data.folded =
        false;

}


/* =====================================================
   指定ブロックを折り畳む
===================================================== */

function foldBlock(data) {

    if (
        data.marker
    ) {

        return;
    }


    createFoldMarker(data);

}


/* =====================================================
   初期状態
===================================================== */

function initializeFolds() {

    buildFoldData();


    /*
     * 最初はすべてのブロックを折る。
     *
     * ただし親を折った時点で
     * 子も画面から隠れる。
     */

    editor.operation(
        function() {

            /*
             * 外側のブロックだけ折る。
             */

            foldData.forEach(
                function(data) {

                    let parent =
                        false;


                    foldData.forEach(
                        function(other) {

                            if (
                                other === data
                            ) {

                                return;
                            }


                            if (
                                other.from < data.from &&
                                other.to >= data.to
                            ) {

                                parent = true;

                            }

                        }
                    );


                    if (!parent) {

                        foldBlock(data);

                    }

                }
            );

        }
    );

}


/* =====================================================
   行DOMに行番号
===================================================== */

editor.on(
    "renderLine",
    function(cm, line, element) {

        element.dataset.line =
            cm.getLineNumber(line);

    }
);


/* =====================================================
   ★ 折り畳み対象行をタップ
===================================================== */

editor.getWrapperElement()
    .addEventListener(
        "click",
        function(event) {

            /*
             * 編集中は
             * CodeMirrorに任せる。
             */

            if (editMode) {

                return;
            }


            const lineElement =
                event.target.closest(
                    ".CodeMirror-line"
                );


            if (!lineElement) {

                return;
            }


            const lineNo =
                parseInt(
                    lineElement.dataset.line,
                    10
                );


            if (
                isNaN(lineNo)
            ) {

                return;
            }


            /*
             * その行に対応するブロック
             */

            const data =
                foldData.find(
                    function(item) {

                        return (
                            item.from === lineNo
                        );

                    }
                );


            if (!data) {

                return;
            }


            /*
             * ------------------------------------------------
             * 折り畳まれている
             * ------------------------------------------------
             */

            if (
                data.folded
            ) {

                unfoldBlock(data);

                return;
            }


            /*
             * ------------------------------------------------
             * 展開されている
             *
             * この行をもう一度押したら
             * 自分自身を折り畳む。
             * ------------------------------------------------
             */

            foldBlock(data);

        },
        false
    );


/* =====================================================
   ★ ダブルタップ
===================================================== */

let lastTapTime = 0;


/*
 * clickではなくtouchendを使って
 * ダブルタップを明確に判定する。
 */

editor.getWrapperElement()
    .addEventListener(
        "touchend",
        function(event) {

            /*
             * 折り畳み行は
             * touchendでは編集開始しない。
             */

            const lineElement =
                event.target.closest(
                    ".CodeMirror-line"
                );


            if (
                lineElement
            ) {

                const lineNo =
                    parseInt(
                        lineElement.dataset.line,
                        10
                    );


                const fold =
                    foldData.find(
                        function(item) {

                            return (
                                item.from === lineNo
                            );

                        }
                    );


                if (fold) {

                    return;
                }

            }


            const now =
                Date.now();


            if (
                now - lastTapTime < 350
            ) {

                /*
                 * ★ ダブルタップ
                 */

                editMode = true;


                editor.setOption(
                    "readOnly",
                    false
                );


                /*
                 * CodeMirror自身の入力欄へ
                 * 明示的にフォーカス
                 */

                editor.focus();


                lastTapTime = 0;


                return;

            }


            lastTapTime =
                now;


        },
        false
    );


/* =====================================================
   ファイル読み込み
===================================================== */

function loadFile(event) {

    const file =
        event.target.files[0];


    if (!file) {

        return;
    }


    const reader =
        new FileReader();


    reader.onload =
        function(e) {

            editor.setValue(
                e.target.result
            );


            currentFileName =
                file.name;


            document.getElementById(
                "file-name-display"
            ).textContent =
                currentFileName;


            const ext =
                currentFileName
                    .split(".")
                    .pop()
                    .toLowerCase();


            let mode =
                "javascript";


            if (
                ext === "html" ||
                ext === "htm"
            ) {

                mode = "htmlmixed";

            }

            else if (
                ext === "css"
            ) {

                mode = "css";

            }

            else if (
                ext === "php"
            ) {

                mode = "php";

            }

            else if (
                ext === "xml"
            ) {

                mode = "xml";

            }


            editor.setOption(
                "mode",
                mode
            );


            editMode = false;


            editor.setOption(
                "readOnly",
                true
            );


            setTimeout(
                function() {

                    editor.refresh();

                    initializeFolds();

                },
                300
            );

        };


    reader.readAsText(file);


    event.target.value = "";

}


/* =====================================================
   保存
===================================================== */

function downloadFile() {

    const code =
        editor.getValue();


    const blob =
        new Blob(
            [code],
            {
                type:
                    "text/plain;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const a =
        document.createElement("a");


    a.href =
        url;


    a.download =
        currentFileName;


    document.body.appendChild(a);


    a.click();


    document.body.removeChild(a);


    URL.revokeObjectURL(url);

}


/* =====================================================
   ボタン
===================================================== */

document.getElementById(
    "open-button"
).addEventListener(
    "click",
    function() {

        document.getElementById(
            "file-input"
        ).click();

    }
);


document.getElementById(
    "save-button"
).addEventListener(
    "click",
    downloadFile
);


/* =====================================================
   初期化
===================================================== */

setTimeout(
    function() {

        editor.refresh();

        initializeFolds();

    },
    300
);
