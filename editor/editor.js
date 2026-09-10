/* =====================================================
   ファイル
===================================================== */

let currentFileName = "untitled.js";


/* =====================================================
   編集モード
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
         * iOS標準選択を優先
         */

        inputStyle: "contenteditable",

        spellcheck: false,

        /*
         * CodeMirror標準のfoldgutterは
         * 今回使わない。
         */

        foldGutter: false

    }

);


/* =====================================================
   起動時は編集不可
===================================================== */

editor.setOption(
    "readOnly",
    true
);


/* =====================================================
   インデント取得
===================================================== */

function getIndent(text) {

    const match =
        text.match(/^[ \t]*/);


    if (!match) {

        return 0;
    }


    let indent = 0;


    for (
        let i = 0;
        i < match[0].length;
        i++
    ) {

        if (
            match[0][i] === "\t"
        ) {

            indent += 4;

        } else {

            indent += 1;

        }

    }


    return indent;

}


/* =====================================================
   ブロック開始判定
===================================================== */

function isBlockStart(text) {

    const line =
        text.trim();


    if (!line) {

        return false;
    }


    /*
     * JavaScript
     *
     * async function
     * function
     * if
     * else
     * for
     * while
     * switch
     * try
     * catch
     * finally
     * class
     */

    if (
        /^(async\s+)?function\b/.test(line) ||
        /^(if|else|for|while|switch|try|catch|finally|class)\b/.test(line)
    ) {

        return true;
    }


    /*
     * 行末が {
     */

    if (
        line.endsWith("{")
    ) {

        return true;
    }


    /*
     * HTMLタグ
     */

    if (
        /^<[A-Za-z][^>]*>$/.test(line) &&
        !/^<\//.test(line)
    ) {

        return true;
    }


    return false;

}


/* =====================================================
   対応するブロック終了行
===================================================== */

function findBlockEnd(startLine) {

    const total =
        editor.lineCount();


    const startText =
        editor.getLine(startLine);


    /*
     * { } を使うブロック
     */

    let braceCount = 0;

    let hasBrace = false;


    for (
        let lineNo = startLine;
        lineNo < total;
        lineNo++
    ) {

        const text =
            editor.getLine(lineNo);


        /*
         * コメントを完全に解析するものではないが、
         * 通常のJSコードでは十分機能する。
         */

        for (
            let i = 0;
            i < text.length;
            i++
        ) {

            if (
                text[i] === "{"
            ) {

                braceCount++;

                hasBrace = true;

            }

            else if (
                text[i] === "}"
            ) {

                braceCount--;

            }

        }


        if (
            hasBrace &&
            braceCount === 0 &&
            lineNo > startLine
        ) {

            return lineNo;
        }

    }


    /*
     * インデントベース
     */

    const startIndent =
        getIndent(startText);


    for (
        let lineNo = startLine + 1;
        lineNo < total;
        lineNo++
    ) {

        const text =
            editor.getLine(lineNo);


        if (!text.trim()) {

            continue;
        }


        if (
            getIndent(text) <= startIndent
        ) {

            return lineNo - 1;
        }

    }


    return null;

}


/* =====================================================
   折り畳み階層を解析
===================================================== */

function analyzeFoldData() {

    foldData = [];


    const total =
        editor.lineCount();


    for (
        let i = 0;
        i < total;
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

            indent: getIndent(text),

            parent: null,

            level: 0,

            folded: false

        });

    }


    /*
     * 親子関係を作る
     */

    foldData.forEach(
        function(item) {

            let parent = null;


            foldData.forEach(
                function(candidate) {

                    if (
                        candidate === item
                    ) {

                        return;
                    }


                    if (
                        candidate.from < item.from &&
                        candidate.to >= item.to &&
                        candidate.indent < item.indent
                    ) {

                        if (
                            !parent ||
                            candidate.from > parent.from
                        ) {

                            parent = candidate;

                        }

                    }

                }
            );


            item.parent = parent;


            if (parent) {

                item.level =
                    parent.level + 1;

            } else {

                item.level = 0;

            }

        }
    );

}


/* =====================================================
   指定行の折り畳み情報
===================================================== */

function getFoldDataAtLine(lineNo) {

    for (
        let i = 0;
        i < foldData.length;
        i++
    ) {

        if (
            foldData[i].from === lineNo
        ) {

            return foldData[i];

        }

    }


    return null;

}


/* =====================================================
   親の「直下」の子だけ取得
===================================================== */

function getDirectChildren(parent) {

    return foldData.filter(
        function(item) {

            return (
                item.parent === parent
            );

        }
    );

}


/* =====================================================
   初期状態
===================================================== */

function foldInitial() {

    analyzeFoldData();


    editor.operation(
        function() {

            /*
             * 最上位ブロックだけを折る。
             */

            foldData
                .filter(
                    function(item) {

                        return (
                            item.parent === null
                        );

                    }
                )
                .sort(
                    function(a, b) {

                        return b.from - a.from;

                    }
                )
                .forEach(
                    function(item) {

                        editor.foldCode(
                            CodeMirror.Pos(
                                item.from,
                                0
                            )
                        );


                        item.folded = true;

                    }
                );

        }
    );


    refreshFoldRows();

}


/* =====================================================
   折り畳み状態の再描画
===================================================== */

function refreshFoldRows() {

    /*
     * 一旦、現在表示されている
     * 行から折り畳み対象行を探す。
     */

    const lines =
        document.querySelectorAll(
            ".CodeMirror-line"
        );


    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const lineElement =
            lines[i];


        const lineNo =
            parseInt(
                lineElement.dataset.line,
                10
            );


        if (
            isNaN(lineNo)
        ) {

            continue;
        }


        const data =
            getFoldDataAtLine(lineNo);


        if (!data) {

            continue;
        }


        /*
         * 行全体をタップ対象にする。
         */

        lineElement.classList.add(
            "editor-fold-line"
        );


        /*
         * 既存アイコンを削除
         */

        const oldIcon =
            lineElement.querySelector(
                ".editor-fold-icon"
            );


        if (oldIcon) {

            oldIcon.remove();

        }


        /*
         * 行頭に表示だけ追加
         */

        const icon =
            document.createElement(
                "span"
            );


        icon.className =
            "editor-fold-icon";


        icon.textContent =
            data.folded
                ? "▶"
                : "▼";


        lineElement.insertBefore(
            icon,
            lineElement.firstChild
        );


        if (
            data.folded
        ) {

            lineElement.classList.add(
                "is-folded"
            );

        } else {

            lineElement.classList.remove(
                "is-folded"
            );

        }

    }

}


/* =====================================================
   行DOMへ行番号をセット
===================================================== */

editor.on(
    "renderLine",
    function(cm, line, element) {

        element.dataset.line =
            cm.getLineNumber(line);

    }
);


/* =====================================================
   ★ 折り畳み行タップ
===================================================== */

editor.getWrapperElement()
    .addEventListener(
        "click",
        function(event) {

            /*
             * 編集モード中は
             * 普通のコード編集を優先。
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


            const data =
                getFoldDataAtLine(lineNo);


            if (!data) {

                return;
            }


            /*
             * -----------------------------------------
             * 現在折り畳まれている
             * -----------------------------------------
             */

            if (
                data.folded
            ) {

                /*
                 * まず親を開く。
                 */

                editor.unfold(
                    CodeMirror.Pos(
                        data.from,
                        0
                    )
                );


                data.folded = false;


                /*
                 * 重要：
                 *
                 * 子ブロックは開かない。
                 *
                 * したがって
                 *
                 * function
                 *     ↓
                 *   if
                 *       ↓
                 *     for
                 *
                 * と1階層ずつ見える。
                 */


                refreshFoldRows();


                return;
            }


            /*
             * -----------------------------------------
             * 現在展開されている
             * -----------------------------------------
             *
             * 直下の子を持っている場合は、
             * 子を1段階だけ折る。
             *
             * 子がなければ自分自身を折る。
             */

            const children =
                getDirectChildren(data);


            if (
                children.length > 0
            ) {

                children
                    .sort(
                        function(a, b) {

                            return b.from - a.from;

                        }
                    )
                    .forEach(
                        function(child) {

                            editor.foldCode(
                                CodeMirror.Pos(
                                    child.from,
                                    0
                                )
                            );


                            child.folded = true;

                        }
                    );


                refreshFoldRows();


                return;
            }


            /*
             * 子がなければ
             * 自分自身を折る。
             */

            editor.foldCode(
                CodeMirror.Pos(
                    data.from,
                    0
                )
            );


            data.folded = true;


            refreshFoldRows();

        },
        false
    );


/* =====================================================
   ★ ダブルタップで編集開始
===================================================== */

editor.getWrapperElement()
    .addEventListener(
        "dblclick",
        function(event) {

            /*
             * 折り畳み行だった場合は
             * 編集モードに入るだけでなく、
             * その行を編集対象にする。
             */

            editMode = true;


            editor.setOption(
                "readOnly",
                false
            );


            editor.focus();

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

            else if (
                ext === "json"
            ) {

                mode = "javascript";

            }


            editor.setOption(
                "mode",
                mode
            );


            /*
             * 読み込み直後は
             * 編集不可に戻す。
             */

            editMode = false;


            editor.setOption(
                "readOnly",
                true
            );


            setTimeout(
                function() {

                    editor.refresh();

                    foldInitial();

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
    function() {

        downloadFile();

    }
);


document.getElementById(
    "file-input"
).addEventListener(
    "change",
    loadFile
);


/* =====================================================
   初期状態
===================================================== */

setTimeout(
    function() {

        editor.refresh();

        foldInitial();

    },
    300
);
